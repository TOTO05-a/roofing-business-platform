import { createHmac, timingSafeEqual } from 'node:crypto';

/** Tiempo mínimo de llenado del formulario público (anti-bots): 3 segundos. */
export const MIN_FILL_MS = 3_000;
/** Vida máxima del token del formulario: 2 horas. */
export const MAX_TOKEN_AGE_MS = 2 * 60 * 60 * 1000;

export type TokenCheck = 'ok' | 'missing' | 'invalid' | 'too_fast' | 'expired';

/** Clave propia derivada del secreto de Better Auth (así un token no sirve para otra cosa). */
function key(secret: string): Buffer {
  return createHmac('sha256', secret).update('public-form-token-v1').digest();
}

function sign(secret: string, issuedAtMs: number): string {
  return createHmac('sha256', key(secret)).update(String(issuedAtMs)).digest('base64url');
}

/** Token sin estado: `{horaDeEmisión}.{HMAC}`. */
export function createFormToken(secret: string, issuedAtMs: number = Date.now()): string {
  return `${issuedAtMs}.${sign(secret, issuedAtMs)}`;
}

/** Comprueba firma, tiempo mínimo de llenado y vigencia del token. */
export function checkFormToken(
  secret: string,
  token: string | undefined,
  nowMs: number = Date.now(),
): TokenCheck {
  if (!token) return 'missing';
  const match = /^(\d{10,16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return 'invalid';
  const issuedAt = Number(match[1]);
  const expected = Buffer.from(sign(secret, issuedAt));
  const received = Buffer.from(match[2] as string);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return 'invalid';
  }
  const age = nowMs - issuedAt;
  if (age < 0) return 'invalid';
  if (age < MIN_FILL_MS) return 'too_fast';
  if (age > MAX_TOKEN_AGE_MS) return 'expired';
  return 'ok';
}
