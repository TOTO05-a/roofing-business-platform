import { Router } from 'express';
import { z } from 'zod';
import { authContext, currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { scopedWhere, visibleOr404 } from '../auth/scope.js';
import type { Prisma } from '../generated/prisma/client.js';
import { recordAudit, requestMeta } from '../lib/audit.js';
import { HttpError } from '../lib/http-error.js';
import { rlsTransaction } from '../lib/rls.js';
import {
  decimalToNumber,
  omitUndefined,
  idParamsSchema,
  optionalText,
  paginationSchema,
  stateSchema,
  zipSchema,
} from '../lib/schemas.js';
import { parseInput } from '../lib/validation.js';
import type { AppServices } from '../services.js';

const propertyFields = {
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: optionalText(200),
  city: z.string().trim().min(1).max(100),
  state: stateSchema,
  zip: zipSchema,
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  yearBuilt: z.number().int().min(1800).max(2100).optional(),
  notes: optionalText(2000),
};

const createPropertySchema = z.object({ customerId: z.uuid(), ...propertyFields }).strict();

// Al editar no se cambia de cliente; todos los campos son opcionales y admiten null para vaciar.
const updatePropertySchema = z
  .object({
    addressLine1: propertyFields.addressLine1,
    addressLine2: z.union([propertyFields.addressLine2, z.null()]),
    city: propertyFields.city,
    state: propertyFields.state,
    zip: propertyFields.zip,
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    yearBuilt: z.number().int().min(1800).max(2100).nullable(),
    notes: z.union([propertyFields.notes, z.null()]),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No hay nada que cambiar');

const listQuerySchema = paginationSchema.extend({
  customerId: z.uuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

const propertySelect = {
  id: true,
  customerId: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  zip: true,
  lat: true,
  lng: true,
  yearBuilt: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PropertySelect;

type PropertyRow = Prisma.PropertyGetPayload<{ select: typeof propertySelect }>;

export function serializeProperty(row: PropertyRow) {
  return { ...row, lat: decimalToNumber(row.lat), lng: decimalToNumber(row.lng) };
}

/** Propiedades (inmuebles) de los clientes. Alta, edición y borrado lógico: solo oficina. */
export function propertiesRouter(services: AppServices): Router {
  const { db } = services;
  const router = Router();
  const authed = requireAuth(services);
  const office = requireRole('ADMIN', 'SUPERADMIN');

  router.post('/properties', authed, office, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const input = parseInput(createPropertySchema, req.body);
    const property = await rlsTransaction(db, context, async (tx) => {
      const customer = await tx.customerProfile.findFirst({
        where: scopedWhere('customerProfile', context, { id: input.customerId }),
        select: { id: true },
      });
      if (!customer) throw new HttpError(404, 'NOT_FOUND', 'Cliente no encontrado');
      const { customerId, ...rest } = input;
      const created = await tx.property.create({
        data: { customerId, ...omitUndefined(rest) },
        select: propertySelect,
      });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'property.create',
        entityType: 'property',
        entityId: created.id,
        after: { customerId, city: created.city, state: created.state },
        ...requestMeta(req),
      });
      return created;
    });
    res.status(201).json({ property: serializeProperty(property) });
  });

  router.get('/properties', authed, async (req, res) => {
    const query = parseInput(listQuerySchema, req.query);
    const context = authContext(req);
    const filter: Prisma.PropertyWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.q
        ? {
            OR: [
              { addressLine1: { contains: query.q, mode: 'insensitive' } },
              { city: { contains: query.q, mode: 'insensitive' } },
              { zip: { startsWith: query.q } },
            ],
          }
        : {}),
    };
    const where = scopedWhere('property', context, filter);
    const { rows, total } = await rlsTransaction(db, context, async (tx) => ({
      rows: await tx.property.findMany({
        where,
        select: propertySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      total: await tx.property.count({ where }),
    }));
    res.json({
      properties: rows.map(serializeProperty),
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  });

  router.get('/properties/:id', authed, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const context = authContext(req);
    const property = await rlsTransaction(db, context, (tx) =>
      tx.property.findFirst({
        where: scopedWhere('property', context, { id }),
        select: propertySelect,
      }),
    );
    res.json({ property: serializeProperty(visibleOr404(property)) });
  });

  router.patch('/properties/:id', authed, office, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(updatePropertySchema, req.body);
    const property = await rlsTransaction(db, context, async (tx) => {
      visibleOr404(
        await tx.property.findFirst({
          where: scopedWhere('property', context, { id }),
          select: { id: true },
        }),
      );
      const updated = await tx.property.update({
        where: { id },
        data: omitUndefined(input),
        select: propertySelect,
      });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'property.update',
        entityType: 'property',
        entityId: id,
        after: { fields: Object.keys(input) },
        ...requestMeta(req),
      });
      return updated;
    });
    res.json({ property: serializeProperty(property) });
  });

  // Borrado lógico: la propiedad deja de verse pero sus citas e inspecciones se conservan.
  router.delete('/properties/:id', authed, office, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const { id } = parseInput(idParamsSchema, req.params);
    await rlsTransaction(db, context, async (tx) => {
      visibleOr404(
        await tx.property.findFirst({
          where: scopedWhere('property', context, { id }),
          select: { id: true },
        }),
      );
      await tx.property.update({ where: { id }, data: { deletedAt: new Date() } });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'property.delete',
        entityType: 'property',
        entityId: id,
        ...requestMeta(req),
      });
    });
    res.status(204).end();
  });

  return router;
}
