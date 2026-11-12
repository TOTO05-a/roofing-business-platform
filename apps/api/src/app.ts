import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import type { HealthResponse } from '@roofing/shared';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
};

function createErrorHandler(isProduction: boolean): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
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

export function createApp(options: { isProduction?: boolean } = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok' };
    res.json(body);
  });

  app.use(notFound);
  app.use(createErrorHandler(options.isProduction ?? false));
  return app;
}
