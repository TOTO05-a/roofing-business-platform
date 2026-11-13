import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth/better-auth.js';
import { recordAudit, requestMeta } from '../lib/audit.js';
import { HttpError } from '../lib/http-error.js';
import { hashToken } from '../lib/tokens.js';
import { parseInput } from '../lib/validation.js';
import type { AppServices } from '../services.js';

const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

const invitationSelect = {
  id: true,
  email: true,
  role: true,
  acceptedAt: true,
  revokedAt: true,
  expiresAt: true,
  customerId: true,
  employeeJobTypes: true,
  invitedBy: { select: { role: true, status: true, deletedAt: true } },
} as const;

interface InvitationState {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  invitedBy: { role: string; status: string; deletedAt: Date | null } | null;
}

/** Comprueba que la invitación sigue siendo utilizable; si no, lanza el error adecuado. */
function assertUsable<T extends InvitationState>(
  invitation: T | null,
  now: Date,
): asserts invitation is T {
  if (!invitation) {
    throw new HttpError(404, 'INVITATION_INVALID', 'La invitación no es válida');
  }
  if (invitation.acceptedAt) {
    throw new HttpError(410, 'INVITATION_USED', 'La invitación ya fue utilizada');
  }
  if (invitation.revokedAt) {
    throw new HttpError(410, 'INVITATION_REVOKED', 'La invitación fue anulada');
  }
  if (invitation.expiresAt <= now) {
    throw new HttpError(410, 'INVITATION_EXPIRED', 'La invitación caducó');
  }
  // Si quien invitó ya no es un superadministrador activo, su invitación deja de valer.
  const inviter = invitation.invitedBy;
  if (
    !inviter ||
    inviter.role !== 'SUPERADMIN' ||
    inviter.status !== 'ACTIVE' ||
    inviter.deletedAt
  ) {
    throw new HttpError(410, 'INVITATION_REVOKED', 'La invitación fue anulada');
  }
}

/** Rutas públicas de invitación: el único camino para crear una cuenta. */
export function invitationsRouter({ systemDb: db, env }: AppServices): Router {
  const router = Router();

  // Ruta pública y costosa (scrypt): límite propio por IP (req.ip respeta TRUST_PROXY).
  const acceptLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.NODE_ENV === 'test' ? 50 : 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos; prueba más tarde' },
      });
    },
  });

  router.post('/accept', acceptLimiter, async (req, res) => {
    const input = parseInput(acceptInvitationSchema, req.body);
    const tokenHash = hashToken(input.token);

    // 1) Rechazo barato de tokens inválidos, usados, revocados o caducados.
    assertUsable(
      await db.invitation.findUnique({ where: { tokenHash }, select: invitationSelect }),
      new Date(),
    );
    // 2) scrypt es lento a propósito: fuera de la transacción.
    const passwordHash = await hashPassword(input.password);

    // 3) Cuenta, perfil y aceptación en una sola transacción.
    const user = await db.$transaction(async (tx) => {
      // Bloquea la fila: si dos peticiones llegan a la vez, la segunda espera aquí y, al
      // releer, ve la invitación ya aceptada. (No se puede marcar aceptada antes de crear el
      // perfil: el CHECK por rol exige employee_id en las invitaciones de empleado aceptadas.)
      await tx.$queryRaw`SELECT id FROM invitations WHERE token_hash = ${tokenHash} FOR UPDATE`;
      const now = new Date();
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash },
        select: invitationSelect,
      });
      assertUsable(invitation, now);

      const existing = await tx.user.findUnique({
        where: { email: invitation.email },
        select: { id: true },
      });
      if (existing) {
        throw new HttpError(409, 'USER_EXISTS', 'Ya existe una cuenta con ese correo');
      }

      const userId = randomUUID();
      const created = await tx.user.create({
        data: {
          id: userId,
          name: input.name,
          email: invitation.email,
          // El enlace llegó a ese buzón: el correo queda verificado.
          emailVerified: true,
          role: invitation.role,
          accounts: {
            create: { providerId: 'credential', accountId: userId, password: passwordHash },
          },
        },
        select: { id: true, email: true, name: true, role: true },
      });
      // Perfil: el cliente ya existía (se enlaza); el empleado se crea ahora.
      let employeeId: string | null = null;
      if (invitation.role === 'CUSTOMER') {
        if (!invitation.customerId) throw new Error('Invitación CUSTOMER sin customer_id');
        const linked = await tx.customerProfile.updateMany({
          where: { id: invitation.customerId, userId: null, deletedAt: null },
          data: { userId: created.id },
        });
        if (linked.count !== 1) {
          throw new HttpError(409, 'CUSTOMER_HAS_ACCOUNT', 'Ese cliente ya tiene una cuenta');
        }
        // Si el cliente no tenía correo registrado, queda el de la invitación.
        await tx.customerProfile.updateMany({
          where: { id: invitation.customerId, email: null },
          data: { email: invitation.email },
        });
      } else if (invitation.role === 'EMPLOYEE') {
        const profile = await tx.employeeProfile.create({
          data: { userId: created.id, jobTypes: invitation.employeeJobTypes },
          select: { id: true },
        });
        employeeId = profile.id;
      }
      const accepted = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: now, acceptedUserId: created.id, employeeId },
      });
      if (accepted.count !== 1) {
        throw new HttpError(410, 'INVITATION_USED', 'La invitación ya fue utilizada');
      }
      await recordAudit(tx, {
        actorUserId: created.id,
        actorEmail: created.email,
        action: 'invitation.accept',
        entityType: 'invitation',
        entityId: invitation.id,
        after: {
          userId: created.id,
          role: created.role,
          customerId: invitation.customerId,
          employeeId,
        },
        ...requestMeta(req),
      });
      return created;
    });

    res.status(201).json({ user });
  });

  return router;
}
