import { Router } from 'express';
import { z } from 'zod';
import { authContext, currentUser, requireAuth } from '../auth/middleware.js';
import { scopedWhere, visibleOr404 } from '../auth/scope.js';
import type { Prisma } from '../generated/prisma/client.js';
import { recordAudit, requestMeta } from '../lib/audit.js';
import { HttpError } from '../lib/http-error.js';
import { rlsTransaction, type RlsTx } from '../lib/rls.js';
import {
  decimalToNumber,
  idParamsSchema,
  omitUndefined,
  optionalText,
  paginationSchema,
} from '../lib/schemas.js';
import { parseInput } from '../lib/validation.js';
import type { AppServices } from '../services.js';

const ROOF_TYPES = [
  'ASPHALT_SHINGLE',
  'METAL',
  'CLAY_TILE',
  'CONCRETE_TILE',
  'FLAT',
  'OTHER',
] as const;
const INSPECTION_STATUSES = ['DRAFT', 'COMPLETED'] as const;

const createSchema = z
  .object({
    appointmentId: z.uuid(),
    roofType: z.enum(ROOF_TYPES).optional(),
    roofAgeYears: z.number().int().min(0).max(150).optional(),
    findings: optionalText(10_000),
  })
  .strict();

const updateSchema = z
  .object({
    roofType: z.enum(ROOF_TYPES).nullable(),
    roofAgeYears: z.number().int().min(0).max(150).nullable(),
    findings: z.union([optionalText(10_000), z.null()]),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No hay nada que cambiar');

// Mismas reglas que los CHECK de inspection_sections (y los límites de las columnas numéricas).
const length = z.number().min(0).max(999_999);
const sectionFields = {
  name: z.string().trim().min(1).max(100),
  areaSqft: z.number().gt(0).max(9_999_999),
  pitchRise: z.number().min(0).max(24),
  ridgeFt: length,
  eaveFt: length,
  hipFt: length,
  valleyFt: length,
  gutterFt: length,
  sortOrder: z.number().int().min(0).max(10_000),
  notes: optionalText(2000),
};
const createSectionSchema = z
  .object({
    ...sectionFields,
    // 4,1: una sola cifra decimal en la pendiente.
    pitchRise: sectionFields.pitchRise.refine((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9, {
      message: 'La pendiente admite un decimal',
    }),
  })
  .partial({
    ridgeFt: true,
    eaveFt: true,
    hipFt: true,
    valleyFt: true,
    gutterFt: true,
    sortOrder: true,
    notes: true,
  })
  .strict();
const updateSectionSchema = z
  .object({ ...sectionFields, notes: z.union([sectionFields.notes, z.null()]) })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No hay nada que cambiar');

const listQuerySchema = paginationSchema.extend({
  status: z.enum(INSPECTION_STATUSES).optional(),
  appointmentId: z.uuid().optional(),
  propertyId: z.uuid().optional(),
});

const sectionSelect = {
  id: true,
  inspectionId: true,
  name: true,
  areaSqft: true,
  pitchRise: true,
  ridgeFt: true,
  eaveFt: true,
  hipFt: true,
  valleyFt: true,
  gutterFt: true,
  sortOrder: true,
  notes: true,
} as const satisfies Prisma.InspectionSectionSelect;

const inspectionSelect = {
  id: true,
  appointmentId: true,
  propertyId: true,
  inspectorId: true,
  status: true,
  completedAt: true,
  roofType: true,
  roofAgeYears: true,
  findings: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.InspectionSelect;

const inspectionDetailSelect = {
  ...inspectionSelect,
  sections: { select: sectionSelect, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  photos: {
    select: { id: true, sectionId: true, fileId: true, caption: true, takenAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} as const satisfies Prisma.InspectionSelect;

type SectionRow = Prisma.InspectionSectionGetPayload<{ select: typeof sectionSelect }>;

export function serializeSection(row: SectionRow) {
  return {
    ...row,
    areaSqft: decimalToNumber(row.areaSqft),
    pitchRise: decimalToNumber(row.pitchRise),
    ridgeFt: decimalToNumber(row.ridgeFt),
    eaveFt: decimalToNumber(row.eaveFt),
    hipFt: decimalToNumber(row.hipFt),
    valleyFt: decimalToNumber(row.valleyFt),
    gutterFt: decimalToNumber(row.gutterFt),
  };
}

type DetailRow = Prisma.InspectionGetPayload<{ select: typeof inspectionDetailSelect }>;
const serializeDetail = (row: DetailRow) => ({
  ...row,
  sections: row.sections.map(serializeSection),
});

/** Busca una inspección visible y borrador (las secciones y fotos solo se tocan en borrador). */
export async function draftInspectionOr404(
  tx: RlsTx,
  context: ReturnType<typeof authContext>,
  id: string,
) {
  const inspection = visibleOr404(
    await tx.inspection.findFirst({
      where: scopedWhere('inspection', context, { id }),
      select: { id: true, status: true, inspectorId: true },
    }),
  );
  if (inspection.status !== 'DRAFT') {
    throw new HttpError(409, 'INSPECTION_COMPLETED', 'La inspección ya está completada');
  }
  return inspection;
}

/** Inspecciones: oficina o empleado asignado; el cliente nunca las ve. */
export function inspectionsRouter(services: AppServices): Router {
  const { db } = services;
  const router = Router();
  const authed = requireAuth(services);

  router.post('/inspections', authed, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const input = parseInput(createSchema, req.body);
    if (context.role === 'CUSTOMER') {
      throw new HttpError(403, 'FORBIDDEN', 'No tienes permiso para esta acción');
    }
    const inspection = await rlsTransaction(db, context, async (tx) => {
      const appointment = visibleOr404(
        await tx.appointment.findFirst({
          where: scopedWhere('appointment', context, { id: input.appointmentId }),
          select: { id: true, propertyId: true, assigneeId: true, type: true, status: true },
        }),
      );
      if (appointment.type !== 'INSPECTION') {
        throw new HttpError(409, 'NOT_AN_INSPECTION', 'La cita no es de tipo inspección');
      }
      if (['CANCELED', 'RESCHEDULED', 'NO_SHOW'].includes(appointment.status)) {
        throw new HttpError(409, 'APPOINTMENT_CLOSED', 'La cita está cancelada o reprogramada');
      }
      const existing = await tx.inspection.findFirst({
        where: { appointmentId: appointment.id },
        select: { id: true },
      });
      if (existing) {
        throw new HttpError(409, 'INSPECTION_EXISTS', 'La cita ya tiene una inspección', {
          inspectionId: existing.id,
        });
      }
      const { appointmentId, ...fields } = input;
      const created = await tx.inspection.create({
        data: {
          appointmentId,
          propertyId: appointment.propertyId,
          inspectorId: appointment.assigneeId,
          ...omitUndefined(fields),
        },
        select: inspectionDetailSelect,
      });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'inspection.create',
        entityType: 'inspection',
        entityId: created.id,
        after: { appointmentId, inspectorId: created.inspectorId },
        ...requestMeta(req),
      });
      return created;
    });
    res.status(201).json({ inspection: serializeDetail(inspection) });
  });

  router.get('/inspections', authed, async (req, res) => {
    const query = parseInput(listQuerySchema, req.query);
    const context = authContext(req);
    const filter: Prisma.InspectionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.appointmentId ? { appointmentId: query.appointmentId } : {}),
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
    };
    const where = scopedWhere('inspection', context, filter);
    const { rows, total } = await rlsTransaction(db, context, async (tx) => ({
      rows: await tx.inspection.findMany({
        where,
        select: inspectionSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      total: await tx.inspection.count({ where }),
    }));
    res.json({ inspections: rows, page: query.page, pageSize: query.pageSize, total });
  });

  router.get('/inspections/:id', authed, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const context = authContext(req);
    const row = await rlsTransaction(db, context, (tx) =>
      tx.inspection.findFirst({
        where: scopedWhere('inspection', context, { id }),
        select: inspectionDetailSelect,
      }),
    );
    res.json({ inspection: serializeDetail(visibleOr404(row)) });
  });

  router.patch('/inspections/:id', authed, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(updateSchema, req.body);
    const inspection = await rlsTransaction(db, context, async (tx) => {
      await draftInspectionOr404(tx, context, id);
      await tx.inspection.update({ where: { id }, data: omitUndefined(input) });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'inspection.update',
        entityType: 'inspection',
        entityId: id,
        after: { fields: Object.keys(input) },
        ...requestMeta(req),
      });
      return tx.inspection.findFirstOrThrow({ where: { id }, select: inspectionDetailSelect });
    });
    res.json({ inspection: serializeDetail(inspection) });
  });

  // --- Secciones del techo ---------------------------------------------------------------

  router.post('/inspections/:id/sections', authed, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(createSectionSchema, req.body);
    const section = await rlsTransaction(db, context, async (tx) => {
      await draftInspectionOr404(tx, context, id);
      const created = await tx.inspectionSection.create({
        data: { inspectionId: id, ...omitUndefined(input) },
        select: sectionSelect,
      });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'inspection.section.create',
        entityType: 'inspection',
        entityId: id,
        after: { sectionId: created.id },
        ...requestMeta(req),
      });
      return created;
    });
    res.status(201).json({ section: serializeSection(section) });
  });

  router.patch('/inspections/:id/sections/:sectionId', authed, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const { id, sectionId } = parseInput(
      z.object({ id: z.uuid(), sectionId: z.uuid() }),
      req.params,
    );
    const input = parseInput(updateSectionSchema, req.body);
    const section = await rlsTransaction(db, context, async (tx) => {
      await draftInspectionOr404(tx, context, id);
      visibleOr404(
        await tx.inspectionSection.findFirst({
          where: { id: sectionId, inspectionId: id },
          select: { id: true },
        }),
      );
      const updated = await tx.inspectionSection.update({
        where: { id: sectionId },
        data: omitUndefined(input),
        select: sectionSelect,
      });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'inspection.section.update',
        entityType: 'inspection',
        entityId: id,
        after: { sectionId, fields: Object.keys(input) },
        ...requestMeta(req),
      });
      return updated;
    });
    res.json({ section: serializeSection(section) });
  });

  router.delete('/inspections/:id/sections/:sectionId', authed, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const { id, sectionId } = parseInput(
      z.object({ id: z.uuid(), sectionId: z.uuid() }),
      req.params,
    );
    await rlsTransaction(db, context, async (tx) => {
      await draftInspectionOr404(tx, context, id);
      visibleOr404(
        await tx.inspectionSection.findFirst({
          where: { id: sectionId, inspectionId: id },
          select: { id: true },
        }),
      );
      await tx.inspectionSection.delete({ where: { id: sectionId } });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'inspection.section.delete',
        entityType: 'inspection',
        entityId: id,
        after: { sectionId },
        ...requestMeta(req),
      });
    });
    res.status(204).end();
  });

  // --- Completar -------------------------------------------------------------------------

  router.post('/inspections/:id/complete', authed, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const { id } = parseInput(idParamsSchema, req.params);
    const inspection = await rlsTransaction(db, context, async (tx) => {
      const current = await draftInspectionOr404(tx, context, id);
      const done = await tx.inspection.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (done.count === 0) {
        throw new HttpError(409, 'INSPECTION_COMPLETED', 'La inspección ya está completada');
      }
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'inspection.complete',
        entityType: 'inspection',
        entityId: id,
        before: { status: current.status },
        after: { status: 'COMPLETED' },
        ...requestMeta(req),
      });
      // El lead pasa a INSPECTED solo si la RLS deja actualizarlo (oficina o empleado asignado
      // al lead); si no, updateMany cuenta 0 y no pasa nada.
      const appointment = await tx.appointment.findFirst({
        where: { inspection: { id } },
        select: { leadId: true },
      });
      if (appointment?.leadId) {
        const moved = await tx.lead.updateMany({
          where: { id: appointment.leadId, status: 'APPOINTMENT_SET' },
          data: { status: 'INSPECTED' },
        });
        if (moved.count > 0) {
          await recordAudit(tx, {
            actorUserId: actor.id,
            actorEmail: actor.email,
            action: 'lead.status',
            entityType: 'lead',
            entityId: appointment.leadId,
            before: { status: 'APPOINTMENT_SET' },
            after: { status: 'INSPECTED', reason: 'inspection.complete' },
            ...requestMeta(req),
          });
        }
      }
      return tx.inspection.findFirstOrThrow({ where: { id }, select: inspectionDetailSelect });
    });
    res.json({ inspection: serializeDetail(inspection) });
  });

  return router;
}
