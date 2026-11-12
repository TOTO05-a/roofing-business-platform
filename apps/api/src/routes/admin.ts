import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { ROLES, USER_STATUSES } from '../auth/roles.js';
import { recordAudit, requestMeta } from '../lib/audit.js';
import { HttpError } from '../lib/http-error.js';
import { actionEmail } from '../lib/mailer.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { emailSchema, parseInput } from '../lib/validation.js';
import type { AppServices } from '../services.js';

const roleSchema = z.enum(ROLES);
const statusSchema = z.enum(USER_STATUSES);

const createInvitationSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});

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
export function adminRouter({ env, db, mailer, auth }: AppServices): Router {
  const router = Router();
  router.use(requireAuth(auth), requireRole('SUPERADMIN'));

  router.post('/invitations', async (req, res) => {
    const actor = currentUser(req);
    const input = parseInput(createInvitationSchema, req.body);

    const existingUser = await db.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existingUser) {
      throw new HttpError(409, 'USER_EXISTS', 'Ya existe una cuenta con ese correo');
    }

    const token = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.INVITATION_TTL_HOURS * 60 * 60 * 1000);

    const invitation = await db.$transaction(async (tx) => {
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
        },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
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
    const [users, total] = await db.$transaction([
      db.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.user.count({ where }),
    ]);
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

    const user = await db.$transaction(async (tx) => {
      const target = await tx.user.findFirst({
        where: { id, deletedAt: null },
        select: userSelect,
      });
      if (!target) {
        throw new HttpError(404, 'NOT_FOUND', 'Usuario no encontrado');
      }
      const nextRole = input.role ?? target.role;
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
