import { Router } from 'express';
import { z } from 'zod';
import { authContext, currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { CONTACT_METHODS } from '../auth/roles.js';
import { scopedWhere, visibleOr404 } from '../auth/scope.js';
import { recordAudit, requestMeta } from '../lib/audit.js';
import { emailSchema, parseInput } from '../lib/validation.js';
import type { AppServices } from '../services.js';

const idParamsSchema = z.object({ id: z.uuid() });

const createCustomerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: emailSchema.optional(),
    // E.164, p. ej. +15551234567 (la base de datos aplica la misma regla).
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9][0-9]{6,14}$/, 'Usa el formato internacional, p. ej. +15551234567')
      .optional(),
    preferredContact: z.enum(CONTACT_METHODS).optional(),
    marketingOptIn: z.boolean().default(false),
  })
  .strict();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const customerSelect = {
  id: true,
  userId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  preferredContact: true,
  marketingOptIn: true,
  createdAt: true,
} as const;

const employeeSelect = {
  id: true,
  userId: true,
  jobTypes: true,
  phone: true,
  isActive: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
} as const;

/** Perfiles de clientes y empleados. Toda lectura pasa por el filtro de alcance. */
export function profilesRouter(services: AppServices): Router {
  const { db } = services;
  const router = Router();
  // requireAuth por ruta (no router.use): este router se monta en /api y no debe
  // convertir en 401 las rutas que no le pertenecen.
  const authed = requireAuth(services);

  // Alta de clientes (oficina). Nace como contacto sin cuenta; se le invita después.
  router.post('/customers', authed, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
    const actor = currentUser(req);
    const input = parseInput(createCustomerSchema, req.body);
    const customer = await db.$transaction(async (tx) => {
      const created = await tx.customerProfile.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          preferredContact: input.preferredContact ?? null,
          marketingOptIn: input.marketingOptIn,
        },
        select: customerSelect,
      });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'customer.create',
        entityType: 'customer_profile',
        entityId: created.id,
        after: { hasEmail: created.email !== null, hasPhone: created.phone !== null },
        ...requestMeta(req),
      });
      return created;
    });
    res.status(201).json({ customer });
  });

  router.get('/customers', authed, async (req, res) => {
    const query = parseInput(listQuerySchema, req.query);
    const where = scopedWhere('customerProfile', authContext(req));
    const [customers, total] = await db.$transaction([
      db.customerProfile.findMany({
        where,
        select: customerSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.customerProfile.count({ where }),
    ]);
    res.json({ customers, page: query.page, pageSize: query.pageSize, total });
  });

  router.get('/customers/:id', authed, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const customer = await db.customerProfile.findFirst({
      where: scopedWhere('customerProfile', authContext(req), { id }),
      select: customerSelect,
    });
    res.json({ customer: visibleOr404(customer) });
  });

  router.get('/employees/:id', authed, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const employee = await db.employeeProfile.findFirst({
      where: scopedWhere('employeeProfile', authContext(req), { id }),
      select: employeeSelect,
    });
    res.json({ employee: visibleOr404(employee) });
  });

  return router;
}
