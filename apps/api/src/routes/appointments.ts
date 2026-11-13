import { Router } from 'express';
import { z } from 'zod';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  checkAppointmentTransition,
} from '../domain/appointment-state.js';
import { checkLeadTransition } from '../domain/lead-state.js';
import { authContext, currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { STAFF_ROLES } from '../auth/roles.js';
import { scopedWhere, visibleOr404 } from '../auth/scope.js';
import type { Prisma } from '../generated/prisma/client.js';
import { recordAudit, requestMeta } from '../lib/audit.js';
import { HttpError } from '../lib/http-error.js';
import { rlsTransaction, type RlsTx } from '../lib/rls.js';
import { idParamsSchema, omitUndefined, optionalText, paginationSchema } from '../lib/schemas.js';
import { parseInput } from '../lib/validation.js';
import type { AppServices } from '../services.js';

const APPOINTMENT_TYPES = ['INSPECTION', 'FOLLOW_UP', 'ESTIMATE_PRESENTATION'] as const;
const APPOINTMENT_STATUSES = [
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELED',
  'NO_SHOW',
  'RESCHEDULED',
] as const;
const MAX_DURATION_MS = 12 * 60 * 60 * 1000;

const isoDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

/** Rango horario válido: fin posterior al inicio y duración de 12 horas como máximo (CHECK). */
function validRange(value: { startsAt: Date; endsAt: Date }): boolean {
  if (!(value.startsAt instanceof Date) || !(value.endsAt instanceof Date)) return true;
  const duration = value.endsAt.getTime() - value.startsAt.getTime();
  return duration > 0 && duration <= MAX_DURATION_MS;
}
const rangeMessage = {
  message: 'La cita debe terminar después de empezar y durar como máximo 12 horas',
  path: ['endsAt'],
};

const createSchema = z
  .object({
    customerId: z.uuid(),
    propertyId: z.uuid(),
    leadId: z.uuid().optional(),
    assigneeId: z.uuid(),
    type: z.enum(APPOINTMENT_TYPES),
    startsAt: isoDate,
    endsAt: isoDate,
    notes: optionalText(2000),
  })
  .strict()
  .refine(validRange, rangeMessage);

const rescheduleSchema = z
  .object({
    startsAt: isoDate,
    endsAt: isoDate,
    assigneeId: z.uuid().optional(),
    notes: optionalText(2000),
  })
  .strict()
  .refine(validRange, rangeMessage);

const updateSchema = z
  .object({ assigneeId: z.uuid(), notes: z.union([optionalText(2000), z.null()]) })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No hay nada que cambiar');

const statusSchema = z
  .object({
    status: z.enum(APPOINTMENT_STATUSES),
    cancelReason: z.string().trim().max(500).optional(),
  })
  .strict();

const listQuerySchema = paginationSchema.extend({
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  type: z.enum(APPOINTMENT_TYPES).optional(),
  assigneeId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  propertyId: z.uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

const appointmentSelect = {
  id: true,
  propertyId: true,
  customerId: true,
  leadId: true,
  assigneeId: true,
  type: true,
  startsAt: true,
  endsAt: true,
  status: true,
  cancelReason: true,
  notes: true,
  rescheduledFromId: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.AppointmentSelect;

type AppointmentRow = Prisma.AppointmentGetPayload<{ select: typeof appointmentSelect }>;

/** El cliente no ve las notas internas ni el motivo de cancelación. */
function serialize(row: AppointmentRow, role: string) {
  if (role !== 'CUSTOMER') return row;
  const { notes: _notes, cancelReason: _cancelReason, ...visible } = row;
  return visible;
}

export const OVERLAP_MESSAGES = {
  es: 'El empleado ya tiene una cita en ese horario. Elige otra hora u otro empleado.',
  en: 'The employee already has an appointment during that time. Choose another time or employee.',
} as const;

function overlapError(conflictingId?: string): HttpError {
  return new HttpError(409, 'APPOINTMENT_OVERLAP', OVERLAP_MESSAGES.es, {
    messages: OVERLAP_MESSAGES,
    ...(conflictingId ? { conflictingAppointmentId: conflictingId } : {}),
  });
}

/** ¿El error es la violación de la EXCLUDE `appointments_no_overlap` (SQLSTATE 23P01)? */
export function isOverlapViolation(error: unknown, depth = 0): boolean {
  if (typeof error !== 'object' || error === null || depth > 5) return false;
  const record = error as Record<string, unknown>;
  if (record.code === '23P01' || record.originalCode === '23P01') return true;
  if (typeof record.message === 'string' && record.message.includes('appointments_no_overlap')) {
    return true;
  }
  if (typeof record.message === 'string' && record.message.includes('23P01')) return true;
  return (
    isOverlapViolation(record.cause, depth + 1) ||
    isOverlapViolation(record.meta, depth + 1) ||
    isOverlapViolation(record.originalError, depth + 1)
  );
}

/** Ejecuta `fn` y convierte la violación de la EXCLUDE (carrera entre dos peticiones) en 409. */
async function translateOverlap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isOverlapViolation(error)) throw overlapError();
    throw error;
  }
}

/** Comprobación previa de solape (la EXCLUDE de la base es la garantía real). */
async function assertNoOverlap(
  tx: RlsTx,
  input: { assigneeId: string; startsAt: Date; endsAt: Date; excludeId?: string },
): Promise<void> {
  const conflict = await tx.appointment.findFirst({
    where: {
      assigneeId: input.assigneeId,
      deletedAt: null,
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: { id: true },
  });
  if (conflict) throw overlapError(conflict.id);
}

async function activeEmployeeOr404(tx: RlsTx, employeeId: string): Promise<void> {
  const employee = await tx.employeeProfile.findFirst({
    where: { AND: [{ id: employeeId }, { isActive: true }, { deletedAt: null }] },
    select: { id: true },
  });
  if (!employee) throw new HttpError(404, 'NOT_FOUND', 'Empleado no encontrado');
}

/** Citas: la oficina las crea y reprograma; el empleado asignado avanza la visita. */
export function appointmentsRouter(services: AppServices): Router {
  const { db } = services;
  const router = Router();
  const authed = requireAuth(services);
  const office = requireRole('ADMIN', 'SUPERADMIN');

  router.post('/appointments', authed, office, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const input = parseInput(createSchema, req.body);
    const appointment = await translateOverlap(() =>
      rlsTransaction(db, context, async (tx) => {
        visibleOr404(
          await tx.property.findFirst({
            where: scopedWhere('property', context, {
              id: input.propertyId,
              customerId: input.customerId,
            }),
            select: { id: true },
          }),
        );
        await activeEmployeeOr404(tx, input.assigneeId);
        if (input.leadId) await linkLeadToAppointment(tx, context, actor, req, input);
        await assertNoOverlap(tx, input);
        const created = await tx.appointment.create({
          data: omitUndefined(input),
          select: appointmentSelect,
        });
        await recordAudit(tx, {
          actorUserId: actor.id,
          actorEmail: actor.email,
          action: 'appointment.create',
          entityType: 'appointment',
          entityId: created.id,
          after: {
            type: created.type,
            assigneeId: created.assigneeId,
            startsAt: created.startsAt.toISOString(),
            leadId: created.leadId,
          },
          ...requestMeta(req),
        });
        return created;
      }),
    );
    res.status(201).json({ appointment: serialize(appointment, context.role) });
  });

  router.get('/appointments', authed, async (req, res) => {
    const query = parseInput(listQuerySchema, req.query);
    const context = authContext(req);
    const filter: Prisma.AppointmentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      ...(query.from ? { endsAt: { gt: query.from } } : {}),
      ...(query.to ? { startsAt: { lt: query.to } } : {}),
    };
    const where = scopedWhere('appointment', context, filter);
    const { rows, total } = await rlsTransaction(db, context, async (tx) => ({
      rows: await tx.appointment.findMany({
        where,
        select: appointmentSelect,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      total: await tx.appointment.count({ where }),
    }));
    res.json({
      appointments: rows.map((row) => serialize(row, context.role)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  });

  router.get('/appointments/:id', authed, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const context = authContext(req);
    const row = await rlsTransaction(db, context, (tx) =>
      tx.appointment.findFirst({
        where: scopedWhere('appointment', context, { id }),
        select: appointmentSelect,
      }),
    );
    res.json({ appointment: serialize(visibleOr404(row), context.role) });
  });

  router.patch('/appointments/:id', authed, office, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(updateSchema, req.body);
    const appointment = await translateOverlap(() =>
      rlsTransaction(db, context, async (tx) => {
        const current = visibleOr404(
          await tx.appointment.findFirst({
            where: scopedWhere('appointment', context, { id }),
            select: { status: true, assigneeId: true, startsAt: true, endsAt: true },
          }),
        );
        if (!ACTIVE_APPOINTMENT_STATUSES.includes(current.status)) {
          throw new HttpError(409, 'INVALID_TRANSITION', 'Una cita cerrada no se puede editar');
        }
        if (input.assigneeId && input.assigneeId !== current.assigneeId) {
          await activeEmployeeOr404(tx, input.assigneeId);
          await assertNoOverlap(tx, {
            assigneeId: input.assigneeId,
            startsAt: current.startsAt,
            endsAt: current.endsAt,
            excludeId: id,
          });
        }
        const updated = await tx.appointment.update({
          where: { id },
          data: omitUndefined(input),
          select: appointmentSelect,
        });
        await recordAudit(tx, {
          actorUserId: actor.id,
          actorEmail: actor.email,
          action: input.assigneeId ? 'appointment.assign' : 'appointment.update',
          entityType: 'appointment',
          entityId: id,
          before: { assigneeId: current.assigneeId },
          after: { fields: Object.keys(input), assigneeId: updated.assigneeId },
          ...requestMeta(req),
        });
        return updated;
      }),
    );
    res.json({ appointment });
  });

  router.post('/appointments/:id/status', authed, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(statusSchema, req.body);
    if (context.role !== 'EMPLOYEE' && !STAFF_ROLES.includes(context.role)) {
      throw new HttpError(403, 'FORBIDDEN', 'No tienes permiso para esta acción');
    }
    if (input.status === 'RESCHEDULED') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Para reprogramar usa POST /api/appointments/:id/reschedule',
      );
    }
    const appointment = await rlsTransaction(db, context, async (tx) => {
      const current = visibleOr404(
        await tx.appointment.findFirst({
          where: scopedWhere('appointment', context, { id }),
          select: { status: true },
        }),
      );
      const change = checkAppointmentTransition({
        from: current.status,
        to: input.status,
        office: STAFF_ROLES.includes(context.role),
        cancelReason: input.cancelReason,
      });
      const result = await tx.appointment.updateMany({
        where: { id, status: current.status },
        data: { status: input.status, cancelReason: change.cancelReason },
      });
      if (result.count === 0) {
        throw new HttpError(409, 'INVALID_TRANSITION', 'La cita cambió de estado; recárgala');
      }
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'appointment.status',
        entityType: 'appointment',
        entityId: id,
        before: { status: current.status },
        after: { status: input.status },
        ...requestMeta(req),
      });
      return tx.appointment.findFirst({ where: { id }, select: appointmentSelect });
    });
    res.json({ appointment: serialize(visibleOr404(appointment), context.role) });
  });

  // Reprogramar = nueva cita con rescheduledFromId; la vieja pasa a RESCHEDULED (misma transacción).
  router.post('/appointments/:id/reschedule', authed, office, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(rescheduleSchema, req.body);
    const result = await translateOverlap(() =>
      rlsTransaction(db, context, async (tx) => {
        const old = visibleOr404(
          await tx.appointment.findFirst({ where: scopedWhere('appointment', context, { id }) }),
        );
        checkAppointmentTransition({ from: old.status, to: 'RESCHEDULED', office: true });
        const assigneeId = input.assigneeId ?? old.assigneeId;
        if (assigneeId !== old.assigneeId) await activeEmployeeOr404(tx, assigneeId);
        // La vieja se libera primero: así el nuevo horario puede pisar el suyo propio.
        const moved = await tx.appointment.updateMany({
          where: { id, status: old.status },
          data: { status: 'RESCHEDULED' },
        });
        if (moved.count === 0) {
          throw new HttpError(409, 'INVALID_TRANSITION', 'La cita cambió de estado; recárgala');
        }
        await assertNoOverlap(tx, { assigneeId, startsAt: input.startsAt, endsAt: input.endsAt });
        const created = await tx.appointment.create({
          data: {
            propertyId: old.propertyId,
            customerId: old.customerId,
            leadId: old.leadId,
            assigneeId,
            type: old.type,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            notes: input.notes ?? old.notes,
            rescheduledFromId: old.id,
          },
          select: appointmentSelect,
        });
        await recordAudit(tx, {
          actorUserId: actor.id,
          actorEmail: actor.email,
          action: 'appointment.reschedule',
          entityType: 'appointment',
          entityId: old.id,
          before: { startsAt: old.startsAt.toISOString(), assigneeId: old.assigneeId },
          after: { newAppointmentId: created.id, startsAt: created.startsAt.toISOString() },
          ...requestMeta(req),
        });
        const previous = await tx.appointment.findFirst({
          where: { id },
          select: appointmentSelect,
        });
        return { appointment: created, previous };
      }),
    );
    res.status(201).json(result);
  });

  return router;
}

/**
 * Una cita ligada a un lead lo lleva a APPOINTMENT_SET (NEW pasa antes por CONTACTED: pedir
 * una cita implica haber contactado). El lead debe estar convertido en ese cliente y propiedad.
 */
async function linkLeadToAppointment(
  tx: RlsTx,
  context: ReturnType<typeof authContext>,
  actor: ReturnType<typeof currentUser>,
  req: Parameters<typeof requestMeta>[0],
  input: { leadId?: string | undefined; customerId: string; propertyId: string; type: string },
): Promise<void> {
  const lead = visibleOr404(
    await tx.lead.findFirst({
      where: scopedWhere('lead', context, { id: input.leadId as string }),
      select: { id: true, status: true, customerId: true, propertyId: true },
    }),
  );
  if (!lead.customerId || !lead.propertyId) {
    throw new HttpError(
      409,
      'LEAD_NOT_CONVERTED',
      'Convierte el lead en cliente y propiedad antes de darle una cita',
    );
  }
  if (lead.customerId !== input.customerId || lead.propertyId !== input.propertyId) {
    throw new HttpError(409, 'LEAD_MISMATCH', 'El lead pertenece a otro cliente o propiedad');
  }
  if (['LOST', 'WON', 'SPAM', 'DUPLICATE'].includes(lead.status)) {
    throw new HttpError(409, 'LEAD_CLOSED', 'El lead está cerrado');
  }
  if (input.type !== 'INSPECTION') return;
  const steps: ('CONTACTED' | 'APPOINTMENT_SET')[] =
    lead.status === 'NEW' ? ['CONTACTED', 'APPOINTMENT_SET'] : [];
  if (lead.status === 'CONTACTED') steps.push('APPOINTMENT_SET');
  let from = lead.status;
  for (const to of steps) {
    checkLeadTransition({ from, to, office: true, converted: true });
    const moved = await tx.lead.updateMany({
      where: { id: lead.id, status: from },
      data: { status: to },
    });
    if (moved.count === 0)
      throw new HttpError(409, 'INVALID_TRANSITION', 'El lead cambió; recárgalo');
    await recordAudit(tx, {
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: 'lead.status',
      entityType: 'lead',
      entityId: lead.id,
      before: { status: from },
      after: { status: to, reason: 'appointment.create' },
      ...requestMeta(req),
    });
    from = to;
  }
}
