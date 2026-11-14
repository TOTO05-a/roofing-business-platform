import type { Db } from '../lib/db.js';

/**
 * Límite de intentos de login por cuenta (complementa el límite por IP de Better Auth, que no
 * frena un ataque repartido entre muchas IP contra una sola cuenta).
 *
 * - Clave: correo normalizado, exista o no la cuenta (la respuesta es la misma en ambos casos).
 * - 10 fallos dentro de una ventana de 15 minutos bloquean la cuenta 15 minutos.
 * - Un login correcto o un restablecimiento de contraseña borran el contador.
 */
export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

type ThrottleDb = Pick<Db, 'loginThrottle'>;

export function normalizeLoginEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length > 0 && email.length <= 254 ? email : null;
}

/** true si la cuenta está bloqueada ahora. Limpia contadores caducados. */
export async function isLoginLocked(db: ThrottleDb, email: string, now = new Date()) {
  const row = await db.loginThrottle.findUnique({ where: { email } });
  if (!row) return false;
  if (row.lockedUntil && row.lockedUntil > now) return true;
  const lockExpired = row.lockedUntil !== null;
  const windowExpired = now.getTime() - row.updatedAt.getTime() > LOGIN_WINDOW_MS;
  if (lockExpired || windowExpired) {
    await db.loginThrottle.deleteMany({ where: { email, updatedAt: row.updatedAt } });
  }
  return false;
}

/** Suma un fallo (de forma atómica). Devuelve true si este fallo provocó el bloqueo. */
export async function recordLoginFailure(db: ThrottleDb, email: string, now = new Date()) {
  const row = await db.loginThrottle.upsert({
    where: { email },
    create: { email, failures: 1 },
    update: { failures: { increment: 1 } },
  });
  if (row.failures >= LOGIN_MAX_FAILURES && !row.lockedUntil) {
    const locked = await db.loginThrottle.updateMany({
      where: { email, lockedUntil: null },
      data: { lockedUntil: new Date(now.getTime() + LOGIN_LOCK_MS) },
    });
    return locked.count === 1;
  }
  return false;
}

export async function clearLoginFailures(db: ThrottleDb, email: string): Promise<void> {
  await db.loginThrottle.deleteMany({ where: { email } });
}
