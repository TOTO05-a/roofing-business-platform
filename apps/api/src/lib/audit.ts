import type { Db } from './db.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface AuditEntry {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

type AuditClient = Pick<Db, 'auditLog'>;

/** Inserta una entrada en el registro de auditoría. Acepta el cliente o una transacción. */
export async function recordAudit(db: AuditClient, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
      ip: entry.ip ?? null,
    },
  });
}
