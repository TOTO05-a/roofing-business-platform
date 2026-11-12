import { z } from 'zod';
import { api } from './client';

export const apiRoles = ['CUSTOMER', 'EMPLOYEE', 'ADMIN', 'SUPERADMIN'] as const;
export type ApiRole = (typeof apiRoles)[number];

const meSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    role: z.enum(apiRoles),
    twoFactorEnabled: z.boolean(),
  }),
  twoFactorRequired: z.boolean(),
});
export type Me = z.infer<typeof meSchema>;
export type SessionUser = Me['user'];

export async function fetchMe(signal?: AbortSignal): Promise<Me> {
  return meSchema.parse(await api('/api/me', signal ? { signal } : {}));
}

export interface SignInResult {
  /** `true` si falta el código TOTP: la contraseña sola no da sesión. */
  twoFactorRequired: boolean;
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const result = await api<{ twoFactorRedirect?: boolean } | null>('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email, password },
  });
  return { twoFactorRequired: result?.twoFactorRedirect === true };
}

export async function signOut(): Promise<void> {
  await api('/api/auth/sign-out', { method: 'POST' });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await api('/api/auth/request-password-reset', {
    method: 'POST',
    body: { email, redirectTo: `${window.location.origin}/restablecer` },
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api('/api/auth/reset-password', { method: 'POST', body: { token, newPassword } });
}

export async function acceptInvitation(
  token: string,
  name: string,
  password: string,
): Promise<void> {
  await api('/api/invitations/accept', { method: 'POST', body: { token, name, password } });
}

const enableSchema = z.object({ totpURI: z.string(), backupCodes: z.array(z.string()) });
export interface TwoFactorEnrollment {
  totpURI: string;
  backupCodes: string[];
}

/** Paso 1 del alta de 2FA: genera la clave TOTP y los códigos de respaldo (aún inactivos). */
export async function enableTwoFactor(password: string): Promise<TwoFactorEnrollment> {
  return enableSchema.parse(
    await api('/api/auth/two-factor/enable', { method: 'POST', body: { password } }),
  );
}

/** Sirve para activar el 2FA (con sesión) y para completar el inicio de sesión. */
export async function verifyTotp(code: string): Promise<void> {
  await api('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code } });
}

export async function verifyBackupCode(code: string): Promise<void> {
  await api('/api/auth/two-factor/verify-backup-code', { method: 'POST', body: { code } });
}

/** Clave en texto (base32) de un URI `otpauth://`, para quien no puede escanear el QR. */
export function secretFromTotpUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get('secret') ?? '';
  } catch {
    return '';
  }
}
