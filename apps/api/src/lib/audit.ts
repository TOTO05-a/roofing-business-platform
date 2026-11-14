import type { Db } from './db.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface AuditEntry {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Estado anterior/posterior de lo que cambió. Nunca contraseñas, tokens ni secretos. */
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

type AuditClient = Pick<Db, 'auditLog'>;

/**
 * Inserta una entrada en el registro de auditoría. Acepta el cliente o una transacción.
 * Usa `createMany` (INSERT sin RETURNING): con RLS, quien audita no siempre puede leer el
 * registro (solo la oficina lee audit_logs).
 */
export async function recordAudit(db: AuditClient, entry: AuditEntry): Promise<void> {
  await db.auditLog.createMany({
    data: {
      actorUserId: entry.actorUserId ?? null,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      ...(entry.before === undefined ? {} : { before: entry.before }),
      ...(entry.after === undefined ? {} : { after: entry.after }),
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}

/** Datos de la petición HTTP que se guardan con cada entrada de auditoría. */
export function requestMeta(req: {
  ip?: string | undefined;
  get(name: string): string | undefined;
}) {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 512) ?? null };
}
