import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { ROLES } from '../auth/roles.js';
import { recordAudit } from '../lib/audit.js';
import { HttpError } from '../lib/http-error.js';
import { actionEmail } from '../lib/mailer.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { emailSchema, parseInput } from '../lib/validation.js';
import type { AppServices } from '../services.js';

const roleSchema = z.enum(ROLES);

const createInvitationSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  role: roleSchema.optional(),
});

const userIdParamsSchema = z.object({ id: z.uuid() });

const updateUserSchema = z
  .object({
    role: roleSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.role !== undefined || value.active !== undefined, {
    message: 'Indica role o active',
  });

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
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
    const expiresAt = new Date(Date.now() + env.INVITATION_TTL_HOURS * 60 * 60 * 1000);

    const invitation = await db.$transaction(async (tx) => {
      // Una invitación nueva reemplaza a las pendientes para el mismo correo.
      const replaced = await tx.invitation.deleteMany({
        where: { email: input.email, usedAt: null },
      });
      const created = await tx.invitation.create({
        data: {
          email: input.email,
          role: input.role,
          tokenHash: hashToken(token),
          expiresAt,
          createdById: actor.id,
        },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'invitation.create',
        entityType: 'invitation',
        entityId: created.id,
        metadata: { email: created.email, role: created.role, replaced: replaced.count },
        ip: req.ip ?? null,
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
        intro: `Te invitamos a crear tu cuenta. El enlace es de un solo uso y caduca el ${invitation.expiresAt.toISOString().slice(0, 10)}.`,
        actionLabel: 'Crear mi cuenta',
        url: url.toString(),
      }),
    );

    res.status(201).json({ invitation });
  });

  router.get('/users', async (req, res) => {
    const query = parseInput(listUsersQuerySchema, req.query);
    const where = query.role ? { role: query.role } : {};
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
      const target = await tx.user.findUnique({ where: { id }, select: userSelect });
      if (!target) {
        throw new HttpError(404, 'NOT_FOUND', 'Usuario no encontrado');
      }
      const nextRole = input.role ?? target.role;
      const nextActive = input.active ?? target.active;
      const roleChanged = nextRole !== target.role;
      const activeChanged = nextActive !== target.active;

      const updated = await tx.user.update({
        where: { id },
        data: { role: nextRole, active: nextActive },
        select: userSelect,
      });

      // Cerrar sesiones abiertas: con otro rol o desactivada, la persona debe volver a entrar.
      if (roleChanged || (activeChanged && !updated.active)) {
        await tx.session.deleteMany({ where: { userId: id } });
      }
      const auditBase = {
        actorId: actor.id,
        actorEmail: actor.email,
        entityType: 'user',
        entityId: id,
        ip: req.ip ?? null,
      };
      if (roleChanged) {
        await recordAudit(tx, {
          ...auditBase,
          action: 'user.role_change',
          metadata: { from: target.role, to: updated.role },
        });
      }
      if (activeChanged) {
        await recordAudit(tx, {
          ...auditBase,
          action: updated.active ? 'user.activate' : 'user.deactivate',
        });
      }
      return updated;
    });

    res.json({ user });
  });

  return router;
}
