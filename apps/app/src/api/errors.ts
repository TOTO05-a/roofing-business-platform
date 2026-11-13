import type { Dictionary } from '@roofing/shared/i18n';
import { ApiError, NetworkError } from './client';

export type AuthErrorKey = keyof Dictionary['app']['auth']['errors'];

/**
 * Traduce un fallo a una clave de mensaje. Los mensajes son deliberadamente genéricos:
 * nunca dicen si una cuenta existe. `overrides` mapea códigos propios de cada pantalla.
 */
export function authErrorKey(
  error: unknown,
  overrides: Readonly<Record<string, AuthErrorKey>> = {},
): AuthErrorKey {
  if (error instanceof NetworkError) return 'network';
  if (error instanceof ApiError) {
    if (error.status === 429) return 'tooMany';
    const byCode = error.code ? overrides[error.code] : undefined;
    if (byCode) return byCode;
    if (error.status >= 500) return 'server';
    switch (error.code) {
      case 'INVALID_EMAIL_OR_PASSWORD':
        return 'invalidCredentials';
      case 'EMAIL_NOT_VERIFIED':
        return 'emailNotVerified';
      case 'ACCOUNT_DISABLED':
        return 'accountDisabled';
      case 'TOO_MANY_ATTEMPTS':
        return 'tooMany';
      case 'INVITATION_INVALID':
        return 'invitationInvalid';
      case 'INVITATION_USED':
        return 'invitationUsed';
      case 'INVITATION_EXPIRED':
      case 'INVITATION_REVOKED':
        return 'invitationExpired';
      case 'USER_EXISTS':
      case 'CUSTOMER_HAS_ACCOUNT':
        return 'accountExists';
      case 'INVALID_TOKEN':
        return 'resetInvalid';
      case 'INVALID_PASSWORD':
        return 'wrongPassword';
      default:
        return error.status === 401 ? 'invalidCredentials' : 'server';
    }
  }
  return 'server';
}
