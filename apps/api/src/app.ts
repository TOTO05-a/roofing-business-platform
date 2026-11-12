import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import { toNodeHandler } from 'better-auth/node';
import type { HealthResponse } from '@roofing/shared';
import { CLIENT_IP_HEADER, trustedOriginsFor } from './auth/better-auth.js';
import { requireTrustedOrigin } from './lib/csrf.js';
import { HttpError } from './lib/http-error.js';
import { adminRouter } from './routes/admin.js';
import { invitationsRouter } from './routes/invitations.js';
import { meRouter } from './routes/me.js';
import { profilesRouter } from './routes/profiles.js';
import type { AppServices } from './services.js';

export { HttpError } from './lib/http-error.js';

const MAX_BODY_BYTES = 100 * 1024;

const limitAuthBody: RequestHandler = (req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  if (req.headers['transfer-encoding']) {
    throw new HttpError(411, 'LENGTH_REQUIRED', 'Falta la cabecera Content-Length');
  }
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo de la petición es demasiado grande');
  }
  next();
};

const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
};

/** Violación de restricción única de Prisma (p. ej. dos invitaciones simultáneas al mismo correo). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

function createErrorHandler(isProduction: boolean): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({
        error: { code: err.code, message: err.message, ...err.details },
      });
      return;
    }
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'El recurso ya existe' } });
      return;
    }
    // Los errores del parser de body (JSON inválido o demasiado grande) traen status 4xx.
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
        ? err.status
        : 500;
    if (status >= 400 && status < 500) {
      res.status(status).json({ error: { code: 'BAD_REQUEST', message: 'Solicitud inválida' } });
      return;
    }
    if (!isProduction) console.error(err);
    res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } });
  };
}

export function createApp(services: AppServices): Express {
  const { env, auth } = services;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());

  // IP del cliente para Better Auth: siempre se sobrescribe con req.ip (respeta TRUST_PROXY),
  // así un cliente no puede falsearla para esquivar el límite de intentos.
  app.use((req, _res, next) => {
    if (req.ip) req.headers[CLIENT_IP_HEADER] = req.ip;
    else delete req.headers[CLIENT_IP_HEADER];
    next();
  });

  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok' };
    res.json(body);
  });

  // CSRF: toda petición que cambia estado (incluido /api/auth, p. ej. el primer login, que
  // aún no lleva cookies y Better Auth solo frena con cabeceras Sec-Fetch) debe traer un
  // Origin (o Referer) de confianza.
  app.use('/api', requireTrustedOrigin(trustedOriginsFor(env)));

  // Better Auth lee el cuerpo entero sin límite: se exige Content-Length y un tamaño máximo.
  app.use('/api/auth', limitAuthBody);
  // Better Auth va antes de express.json(): necesita leer el cuerpo sin procesar.
  app.all('/api/auth/*splat', toNodeHandler(auth));

  app.use(express.json({ limit: MAX_BODY_BYTES }));

  app.use('/api/me', meRouter(services));
  app.use('/api/invitations', invitationsRouter(services));
  app.use('/api/admin', adminRouter(services));
  app.use('/api', profilesRouter(services));

  app.use(notFound);
  app.use(createErrorHandler(env.NODE_ENV === 'production'));
  return app;
}
