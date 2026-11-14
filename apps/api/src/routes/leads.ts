import { Router } from 'express';
import { z } from 'zod';
import { checkLeadTransition } from '../domain/lead-state.js';
import { authContext, currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { STAFF_ROLES } from '../auth/roles.js';
import { scopedWhere, visibleOr404 } from '../auth/scope.js';
import type { Prisma } from '../generated/prisma/client.js';
import { recordAudit, requestMeta } from '../lib/audit.js';
import { HttpError } from '../lib/http-error.js';
import { rlsTransaction } from '../lib/rls.js';
import {
  idParamsSchema,
  omitUndefined,
  optionalText,
  paginationSchema,
  phoneSchema,
  stateSchema,
  zipSchema,
} from '../lib/schemas.js';
import { emailSchema, parseInput } from '../lib/validation.js';
import type { AppServices } from '../services.js';

const MANUAL_SOURCES = ['PHONE', 'REFERRAL', 'DOOR_KNOCK', 'OTHER'] as const;
const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'APPOINTMENT_SET',
  'INSPECTED',
  'QUOTED',
  'WON',
  'LOST',
  'SPAM',
  'DUPLICATE',
] as const;
const LEAD_SOURCES = ['WEB_FORM', ...MANUAL_SOURCES] as const;

const contactFields = {
  firstName: z.string().trim().min(1).max(100),
  lastName: optionalText(100),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  state: stateSchema.optional(),
  zip: zipSchema.optional(),
  message: optionalText(5000),
  sourceDetail: optionalText(200),
};

const createLeadSchema = z
  .object({
    source: z.enum(MANUAL_SOURCES),
    assignedToId: z.uuid().optional(),
    ...contactFields,
  })
  .strict()
  .refine((value) => value.email || value.phone, {
    message: 'Indica al menos un correo o un teléfono',
    path: ['email'],
  });

const updateLeadSchema = z
  .object({
    firstName: contactFields.firstName,
    lastName: z.union([contactFields.lastName, z.null()]),
    email: z.union([emailSchema, z.null()]),
    phone: z.union([phoneSchema, z.null()]),
    addressLine1: z.union([contactFields.addressLine1, z.null()]),
    addressLine2: z.union([contactFields.addressLine2, z.null()]),
    city: z.union([contactFields.city, z.null()]),
    state: z.union([stateSchema, z.null()]),
    zip: z.union([zipSchema, z.null()]),
    message: z.union([contactFields.message, z.null()]),
    sourceDetail: z.union([contactFields.sourceDetail, z.null()]),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No hay nada que cambiar');

const assignSchema = z.object({ employeeId: z.uuid().nullable() }).strict();

const statusSchema = z
  .object({ status: z.enum(LEAD_STATUSES), lostReason: z.string().trim().max(500).optional() })
  .strict();

const convertSchema = z
  .object({
    customerId: z.uuid().optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    propertyId: z.uuid().optional(),
    property: z
      .object({
        addressLine1: z.string().trim().min(1).max(200),
        addressLine2: optionalText(200),
        city: z.string().trim().min(1).max(100),
        state: stateSchema,
        zip: zipSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

const listQuerySchema = paginationSchema.extend({
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  assignedToId: z.uuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

const leadSelect = {
  id: true,
  status: true,
  source: true,
  sourceDetail: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  zip: true,
  message: true,
  utm: true,
  spamReason: true,
  assignedToId: true,
  customerId: true,
  propertyId: true,
  lostReason: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.LeadSelect;

/** Leads: oficina los crea, edita, asigna y convierte; el empleado asignado cambia su estado. */
export function leadsRouter(services: AppServices): Router {
  const { db } = services;
  const router = Router();
  const authed = requireAuth(services);
  const office = requireRole('ADMIN', 'SUPERADMIN');

  router.post('/leads', authed, office, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const input = parseInput(createLeadSchema, req.body);
    const lead = await rlsTransaction(db, context, async (tx) => {
      if (input.assignedToId) {
        const employee = await tx.employeeProfile.findFirst({
          where: { AND: [{ id: input.assignedToId }, { isActive: true }, { deletedAt: null }] },
          select: { id: true },
        });
        if (!employee) throw new HttpError(404, 'NOT_FOUND', 'Empleado no encontrado');
      }
      const created = await tx.lead.create({
        data: omitUndefined(input),
        select: leadSelect,
      });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'lead.create',
        entityType: 'lead',
        entityId: created.id,
        after: { source: created.source, assignedToId: created.assignedToId },
        ...requestMeta(req),
      });
      return created;
    });
    res.status(201).json({ lead });
  });

  router.get('/leads', authed, async (req, res) => {
    const query = parseInput(listQuerySchema, req.query);
    const context = authContext(req);
    const filter: Prisma.LeadWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q.toLowerCase() } },
              { phone: { contains: query.q.replace(/[^\d+]/g, '') || '@@' } },
            ],
          }
        : {}),
    };
    const where = scopedWhere('lead', context, filter);
    const { rows, total } = await rlsTransaction(db, context, async (tx) => ({
      rows: await tx.lead.findMany({
        where,
        select: leadSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      total: await tx.lead.count({ where }),
    }));
    res.json({ leads: rows, page: query.page, pageSize: query.pageSize, total });
  });

  router.get('/leads/:id', authed, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const context = authContext(req);
    const lead = await rlsTransaction(db, context, (tx) =>
      tx.lead.findFirst({ where: scopedWhere('lead', context, { id }), select: leadSelect }),
    );
    res.json({ lead: visibleOr404(lead) });
  });

  router.patch('/leads/:id', authed, office, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(updateLeadSchema, req.body);
    const lead = await rlsTransaction(db, context, async (tx) => {
      const current = visibleOr404(
        await tx.lead.findFirst({
          where: scopedWhere('lead', context, { id }),
          select: { email: true, phone: true },
        }),
      );
      const email = input.email === undefined ? current.email : input.email;
      const phone = input.phone === undefined ? current.phone : input.phone;
      if (!email && !phone) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'El lead necesita un correo o un teléfono', {
          issues: [{ path: 'email', message: 'Indica al menos un correo o un teléfono' }],
        });
      }
      const updated = await tx.lead.update({
        where: { id },
        data: omitUndefined(input),
        select: leadSelect,
      });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'lead.update',
        entityType: 'lead',
        entityId: id,
        after: { fields: Object.keys(input) },
        ...requestMeta(req),
      });
      return updated;
    });
    res.json({ lead });
  });

  router.post('/leads/:id/assign', authed, office, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const { id } = parseInput(idParamsSchema, req.params);
    const { employeeId } = parseInput(assignSchema, req.body);
    const lead = await rlsTransaction(db, context, async (tx) => {
      const current = visibleOr404(
        await tx.lead.findFirst({
          where: scopedWhere('lead', context, { id }),
          select: { assignedToId: true },
        }),
      );
      if (employeeId) {
        const employee = await tx.employeeProfile.findFirst({
          where: { AND: [{ id: employeeId }, { isActive: true }, { deletedAt: null }] },
          select: { id: true },
        });
        if (!employee) throw new HttpError(404, 'NOT_FOUND', 'Empleado no encontrado');
      }
      const updated = await tx.lead.update({
        where: { id },
        data: { assignedToId: employeeId },
        select: leadSelect,
      });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'lead.assign',
        entityType: 'lead',
        entityId: id,
        before: { assignedToId: current.assignedToId },
        after: { assignedToId: employeeId },
        ...requestMeta(req),
      });
      return updated;
    });
    res.json({ lead });
  });

  // Cambio de estado: una sola función decide (domain/lead-state.ts). La oficina o el empleado
  // asignado (la RLS le impide reasignar el lead a otra persona).
  router.post('/leads/:id/status', authed, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(statusSchema, req.body);
    if (!STAFF_ROLES.includes(context.role) && context.role !== 'EMPLOYEE') {
      throw new HttpError(403, 'FORBIDDEN', 'No tienes permiso para esta acción');
    }
    const lead = await rlsTransaction(db, context, async (tx) => {
      const current = visibleOr404(
        await tx.lead.findFirst({
          where: scopedWhere('lead', context, { id }),
          select: { status: true, customerId: true, propertyId: true },
        }),
      );
      const change = checkLeadTransition({
        from: current.status,
        to: input.status,
        office: STAFF_ROLES.includes(context.role),
        lostReason: input.lostReason,
        converted: current.customerId !== null && current.propertyId !== null,
      });
      // Condición sobre el estado leído: si otra petición lo cambió antes, no se pisa.
      const result = await tx.lead.updateMany({
        where: { id, status: current.status },
        data: { status: input.status, lostReason: change.lostReason },
      });
      if (result.count === 0) {
        throw new HttpError(409, 'INVALID_TRANSITION', 'El lead cambió de estado; recárgalo');
      }
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'lead.status',
        entityType: 'lead',
        entityId: id,
        before: { status: current.status },
        after: { status: input.status },
        ...requestMeta(req),
      });
      return tx.lead.findFirst({ where: { id }, select: leadSelect });
    });
    res.json({ lead: visibleOr404(lead) });
  });

  // Conversión: crea o enlaza el cliente y la propiedad en una sola transacción (oficina).
  router.post('/leads/:id/convert', authed, office, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(convertSchema, req.body ?? {});
    const result = await rlsTransaction(db, context, async (tx) => {
      const lead = visibleOr404(
        await tx.lead.findFirst({ where: scopedWhere('lead', context, { id }) }),
      );
      if (lead.customerId || lead.propertyId) {
        throw new HttpError(409, 'ALREADY_CONVERTED', 'El lead ya está convertido');
      }
      if (['LOST', 'WON', 'SPAM', 'DUPLICATE'].includes(lead.status)) {
        throw new HttpError(409, 'LEAD_CLOSED', 'Un lead cerrado no se puede convertir');
      }

      // Cliente: el indicado, uno existente con el mismo correo o teléfono, o uno nuevo.
      let customerId = input.customerId;
      let customerCreated = false;
      if (customerId) {
        visibleOr404(
          await tx.customerProfile.findFirst({
            where: { AND: [{ id: customerId }, { deletedAt: null }] },
            select: { id: true },
          }),
        );
      } else {
        const matches: Prisma.CustomerProfileWhereInput[] = [];
        if (lead.email) matches.push({ email: { equals: lead.email, mode: 'insensitive' } });
        if (lead.phone) matches.push({ phone: lead.phone });
        const existing =
          matches.length > 0
            ? await tx.customerProfile.findFirst({
                where: { AND: [{ deletedAt: null }, { OR: matches }] },
                orderBy: { createdAt: 'asc' },
                select: { id: true },
              })
            : null;
        if (existing) {
          customerId = existing.id;
        } else {
          const lastName = input.lastName ?? lead.lastName;
          if (!lastName) {
            throw new HttpError(400, 'VALIDATION_ERROR', 'Falta el apellido del cliente', {
              issues: [{ path: 'lastName', message: 'El lead no tiene apellido; indícalo' }],
            });
          }
          const created = await tx.customerProfile.create({
            data: {
              firstName: lead.firstName,
              lastName,
              email: lead.email,
              phone: lead.phone,
            },
            select: { id: true },
          });
          customerId = created.id;
          customerCreated = true;
        }
      }

      // Propiedad: la indicada, una igual ya registrada para ese cliente, o una nueva.
      let propertyId = input.propertyId;
      let propertyCreated = false;
      if (propertyId) {
        visibleOr404(
          await tx.property.findFirst({
            where: scopedWhere('property', context, { id: propertyId, customerId }),
            select: { id: true },
          }),
        );
      } else {
        const address = input.property ?? {
          addressLine1: lead.addressLine1,
          addressLine2: lead.addressLine2,
          city: lead.city,
          state: lead.state,
          zip: lead.zip,
        };
        if (!address.addressLine1 || !address.city || !address.state || !address.zip) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'La dirección del lead está incompleta', {
            issues: [{ path: 'property', message: 'Indica la dirección de la propiedad' }],
          });
        }
        const same = await tx.property.findFirst({
          where: scopedWhere('property', context, {
            customerId,
            addressLine1: { equals: address.addressLine1, mode: 'insensitive' },
            zip: address.zip,
          }),
          select: { id: true },
        });
        if (same) {
          propertyId = same.id;
        } else {
          const created = await tx.property.create({
            data: {
              customerId,
              addressLine1: address.addressLine1,
              addressLine2: address.addressLine2 ?? null,
              city: address.city,
              state: address.state,
              zip: address.zip,
            },
            select: { id: true },
          });
          propertyId = created.id;
          propertyCreated = true;
        }
      }

      const linked = await tx.lead.updateMany({
        where: { id, customerId: null },
        data: { customerId, propertyId },
      });
      if (linked.count === 0) {
        throw new HttpError(409, 'ALREADY_CONVERTED', 'El lead ya está convertido');
      }
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'lead.convert',
        entityType: 'lead',
        entityId: id,
        after: { customerId, propertyId, customerCreated, propertyCreated },
        ...requestMeta(req),
      });
      const updated = await tx.lead.findFirst({ where: { id }, select: leadSelect });
      return { lead: updated, customerId, propertyId, customerCreated, propertyCreated };
    });
    res.json(result);
  });

  return router;
}
