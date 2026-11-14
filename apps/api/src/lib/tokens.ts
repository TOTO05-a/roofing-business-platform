import { createHash, randomBytes } from 'node:crypto';

/** Token aleatorio de 256 bits en base64url (para enlaces de un solo uso). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
