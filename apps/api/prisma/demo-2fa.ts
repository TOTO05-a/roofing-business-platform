/**
 * Verificación en dos pasos (2FA) de la DEMO LOCAL: el administrador y el superadministrador
 * demo quedan con el 2FA ya activado y un secreto TOTP FIJO y PÚBLICO, para no tener que
 * escanear un QR cada vez. Solo existe con SEED_DEMO=true y fuera de producción; el flujo de
 * 2FA de los usuarios reales no cambia. Documentado en CREDENCIALES.md.
 */
import { createHmac } from 'node:crypto';

/** Secreto TOTP de la demo en base32 (compatible con cualquier app de autenticación). */
export const DEMO_TOTP_SECRET_BASE32 = 'CRESTAROOFINGDEMOTWOFACTOR';

/** Códigos de respaldo fijos de la demo (cada uno sirve una sola vez por usuario). */
export const DEMO_BACKUP_CODES = [
  'DEMOS-ADM01',
  'DEMOS-ADM02',
  'DEMOS-ADM03',
  'DEMOS-ADM04',
  'DEMOS-ADM05',
] as const;

/** Usuarios demo que tienen el 2FA precargado. */
export const DEMO_2FA_EMAILS = [
  'administrador@cresta-roofing.example',
  'superadmin@cresta-roofing.example',
] as const;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text.toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Código TOTP de 6 dígitos (RFC 6238, SHA-1, 30 s) del secreto de la demo. */
export function demoTotpCode(now: number = Date.now()): { code: string; secondsLeft: number } {
  const counter = Math.floor(now / 1000 / 30);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(DEMO_TOTP_SECRET_BASE32)).update(message).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return {
    code: String(binary % 1_000_000).padStart(6, '0'),
    secondsLeft: 30 - (Math.floor(now / 1000) % 30),
  };
}
