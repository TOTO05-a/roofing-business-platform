import { Router } from 'express';
import { z } from 'zod';
import { authContext, currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { EMPLOYEE_JOB_TYPES, requiresTwoFactor, ROLES, USER_STATUSES } from '../auth/roles.js';
import { recordAudit, requestMeta } from '../lib/audit.js';
import { HttpError } from '../lib/http-error.js';
import { actionEmail } from '../lib/mailer.js';
import { rlsTransaction, withRls } from '../lib/rls.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { emailSchema, parseInput } from '../lib/validation.js';
import type { AppServices } from '../services.js';

const roleSchema = z.enum(ROLES);
const statusSchema = z.enum(USER_STATUSES);

// Cada rol trae lo que necesita su perfil (modelo de datos §2.1):
// - CUSTOMER: el CustomerProfile ya creado por la oficina.
// - EMPLOYEE: los tipos de trabajo; el EmployeeProfile se crea al aceptar.
const createInvitationSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('CUSTOMER'), email: emailSchema, customerId: z.uuid() }).strict(),
  z
    .object({
      role: z.literal('EMPLOYEE'),
      email: emailSchema,
      jobTypes: z
        .array(z.enum(EMPLOYEE_JOB_TYPES))
        .min(1)
        .refine((types) => new Set(types).size === types.length, 'Tipos de trabajo repetidos'),
    })
    .strict(),
  z.object({ role: z.enum(['ADMIN', 'SUPERADMIN']), email: emailSchema }).strict(),
]);

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  role: roleSchema.optional(),
  status: statusSchema.optional(),
});

const userIdParamsSchema = z.object({ id: z.uuid() });

const updateUserSchema = z
  .object({
    role: roleSchema.optional(),
    status: statusSchema.optional(),
  })
  .strict()
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: 'Indica role o status',
  });

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  emailVerified: true,
  twoFactorEnabled: true,
  createdAt: true,
} as const;

/** Administración de usuarios e invitaciones: solo SUPERADMIN (con 2FA activo). */
export function adminRouter(services: AppServices): Router {
  const { env, mailer, db } = services;
  const router = Router();
  router.use(requireAuth(services), requireRole('SUPERADMIN'));

  router.post('/invitations', async (req, res) => {
    const actor = currentUser(req);
    const input = parseInput(createInvitationSchema, req.body);

    const rls = withRls(db, authContext(req));
    const existingUser = await rls.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existingUser) {
      throw new HttpError(409, 'USER_EXISTS', 'Ya existe una cuenta con ese correo');
    }

    if (input.role === 'CUSTOMER') {
      const customer = await rls.customerProfile.findFirst({
        where: { id: input.customerId, deletedAt: null },
        select: { userId: true, email: true },
      });
      if (!customer) {
        throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'El cliente no existe');
      }
      if (customer.userId) {
        throw new HttpError(409, 'CUSTOMER_HAS_ACCOUNT', 'Ese cliente ya tiene una cuenta');
      }
      if (customer.email && customer.email !== input.email) {
        throw new HttpError(
          409,
          'EMAIL_MISMATCH',
          'El correo no coincide con el registrado para ese cliente',
        );
      }
    }

    const token = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.INVITATION_TTL_HOURS * 60 * 60 * 1000);

    const invitation = await rlsTransaction(db, authContext(req), async (tx) => {
      // Una invitación nueva anula las pendientes para el mismo correo.
      const revoked = await tx.invitation.updateMany({
        where: { email: input.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      const created = await tx.invitation.create({
        data: {
          email: input.email,
          role: input.role,
          tokenHash: hashToken(token),
          expiresAt,
          invitedById: actor.id,
          customerId: input.role === 'CUSTOMER' ? input.customerId : null,
          employeeJobTypes: input.role === 'EMPLOYEE' ? input.jobTypes : [],
        },
        select: {
          id: true,
          email: true,
          role: true,
          customerId: true,
          employeeJobTypes: true,
          expiresAt: true,
          createdAt: true,
        },
      });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'invitation.create',
        entityType: 'invitation',
        entityId: created.id,
        after: {
          email: created.email,
          role: created.role,
          customerId: created.customerId,
          employeeJobTypes: created.employeeJobTypes,
          expiresAt: created.expiresAt.toISOString(),
          revokedPending: revoked.count,
        },
        ...requestMeta(req),
      });
      return created;
    });

    // El token va en el fragmento (#): el navegador no lo envía a ningún servidor ni en Referer.
    const url = new URL('/invitacion', env.APP_URL);
    url.hash = new URLSearchParams({ token }).toString();
    await mailer.send(
      actionEmail({
        to: invitation.email,
        subject: `${env.APP_NAME}: te invitamos a la plataforma`,
        intro: `Te invitamos a crear tu cuenta. El enlace es de un solo uso y caduca el ${invitation.expiresAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
        actionLabel: 'Crear mi cuenta',
        url: url.toString(),
      }),
    );

    res.status(201).json({ invitation });
  });

  router.get('/users', async (req, res) => {
    const query = parseInput(listUsersQuerySchema, req.query);
    const where = {
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const { users, total } = await rlsTransaction(db, authContext(req), async (tx) => ({
      users: await tx.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      total: await tx.user.count({ where }),
    }));
    res.json({ users, page: query.page, pageSize: query.pageSize, total });
  });

  router.patch('/users/:id', async (req, res) => {
    const actor = currentUser(req);
    const { id } = parseInput(userIdParamsSchema, req.params);
    const input = parseInput(updateUserSchema, req.body);

    if (id === actor.id) {
      // Evita que el único superadministrador se quite el acceso por error.
      throw new HttpError(409, 'CANNOT_MODIFY_SELF', 'No puedes cambiar tu propio rol o estado');
    }

    const user = await rlsTransaction(db, authContext(req), async (tx) => {
      const target = await tx.user.findFirst({
        where: { id, deletedAt: null },
        select: { ...userSelect, employeeProfile: { select: { isActive: true, deletedAt: true } } },
      });
      if (!target) {
        throw new HttpError(404, 'NOT_FOUND', 'Usuario no encontrado');
      }
      const nextRole = input.role ?? target.role;
      if (nextRole !== target.role) {
        // Una cuenta de cliente nunca cambia de rol (ni nadie pasa a ser cliente): sus datos
        // cuelgan del CustomerProfile.
        if (target.role === 'CUSTOMER' || nextRole === 'CUSTOMER') {
          throw new HttpError(
            409,
            'ROLE_CHANGE_NOT_ALLOWED',
            'Las cuentas de cliente no cambian de rol',
          );
        }
        // Nadie llega a ADMIN o SUPERADMIN sin haber activado antes su 2FA.
        if (requiresTwoFactor(nextRole) && !target.twoFactorEnabled) {
          throw new HttpError(
            409,
            'TWO_FACTOR_REQUIRED_FOR_ROLE',
            'La persona debe activar la verificación en dos pasos antes de recibir ese rol',
          );
        }
        // EMPLOYEE necesita un EmployeeProfile activo (un ADMIN puede tenerlo además).
        const profile = target.employeeProfile;
        if (nextRole === 'EMPLOYEE' && (!profile || !profile.isActive || profile.deletedAt)) {
          throw new HttpError(
            409,
            'EMPLOYEE_PROFILE_REQUIRED',
            'Para ser EMPLOYEE hace falta un perfil de empleado activo',
          );
        }
      }
      const nextStatus = input.status ?? target.status;
      const roleChanged = nextRole !== target.role;
      const statusChanged = nextStatus !== target.status;

      const updated = await tx.user.update({
        where: { id },
        data: { role: nextRole, status: nextStatus },
        select: userSelect,
      });

      if (roleChanged || (statusChanged && updated.status === 'DISABLED')) {
        // Con otro rol o desactivada, la persona debe volver a entrar.
        await tx.session.deleteMany({ where: { userId: id } });
        // Las invitaciones pendientes que envió dejan de valer (no quedan puertas traseras).
        await tx.invitation.updateMany({
          where: { invitedById: id, acceptedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      const auditBase = {
        actorUserId: actor.id,
        actorEmail: actor.email,
        entityType: 'user',
        entityId: id,
        ...requestMeta(req),
      };
      if (roleChanged) {
        await recordAudit(tx, {
          ...auditBase,
          action: 'user.role_change',
          before: { role: target.role },
          after: { role: updated.role },
        });
      }
      if (statusChanged) {
        await recordAudit(tx, {
          ...auditBase,
          action: updated.status === 'ACTIVE' ? 'user.activate' : 'user.deactivate',
          before: { status: target.status },
          after: { status: updated.status },
        });
      }
      return updated;
    });

    res.json({ user });
  });

  return router;
}
