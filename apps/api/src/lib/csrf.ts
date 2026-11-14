import type { RequestHandler } from 'express';
import { HttpError } from './http-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestOrigin(origin: string | undefined, referer: string | undefined): string | null {
  if (origin && origin !== 'null') return origin;
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Protección CSRF para las rutas propias de la API (Better Auth ya protege /api/auth):
 * toda petición que cambia estado debe venir de un origen de confianza. Se suma a las
 * cookies SameSite=Lax y a que los cuerpos solo se aceptan como JSON.
 */
export function requireTrustedOrigin(trustedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(trustedOrigins);
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = requestOrigin(req.get('origin'), req.get('referer'));
    if (!origin || !allowed.has(origin)) {
      throw new HttpError(403, 'INVALID_ORIGIN', 'Origen no permitido');
    }
    next();
  };
}
