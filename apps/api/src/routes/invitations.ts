import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth/better-auth.js';
import { recordAudit } from '../lib/audit.js';
import { HttpError } from '../lib/http-error.js';
import { hashToken } from '../lib/tokens.js';
import { parseInput } from '../lib/validation.js';
import type { AppServices } from '../services.js';

const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

/** Rutas públicas de invitación: el único camino para crear una cuenta. */
export function invitationsRouter({ db }: AppServices): Router {
  const router = Router();

  router.post('/accept', async (req, res) => {
    const input = parseInput(acceptInvitationSchema, req.body);
    // Se calcula fuera de la transacción: scrypt es lento a propósito.
    const passwordHash = await hashPassword(input.password);
    const now = new Date();

    const user = await db.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash: hashToken(input.token) },
      });
      if (!invitation) {
        throw new HttpError(404, 'INVITATION_INVALID', 'La invitación no es válida');
      }
      if (invitation.usedAt) {
        throw new HttpError(410, 'INVITATION_USED', 'La invitación ya fue utilizada');
      }
      if (invitation.expiresAt <= now) {
        throw new HttpError(410, 'INVITATION_EXPIRED', 'La invitación caducó');
      }
      // Reclamo atómico: si dos peticiones llegan a la vez, solo una actualiza la fila.
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw new HttpError(410, 'INVITATION_USED', 'La invitación ya fue utilizada');
      }
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
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedUserId: created.id },
      });
      await recordAudit(tx, {
        actorId: created.id,
        actorEmail: created.email,
        action: 'invitation.accept',
        entityType: 'invitation',
        entityId: invitation.id,
        metadata: { role: created.role },
        ip: req.ip ?? null,
      });
      return created;
    });

    res.status(201).json({ user });
  });

  return router;
}
