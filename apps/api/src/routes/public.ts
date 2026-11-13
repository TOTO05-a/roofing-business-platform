import express, { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { recordAudit, requestMeta } from '../lib/audit.js';
import { checkFormToken, createFormToken } from '../lib/form-token.js';
import { HttpError } from '../lib/http-error.js';
import { optionalText, phoneSchema, stateSchema, zipSchema } from '../lib/schemas.js';
import { emailSchema, parseInput } from '../lib/validation.js';
import type { AppServices } from '../services.js';

/** Nombre del campo trampa: oculto para personas, tentador para bots. */
export const HONEYPOT_FIELD = 'website_url';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

const utmSchema = z
  .object(Object.fromEntries(UTM_KEYS.map((name) => [name, z.string().trim().max(200).optional()])))
  .partial();

const publicLeadSchema = z
  .object({
    token: z.string().max(200).optional(),
    [HONEYPOT_FIELD]: z.string().max(500).optional(),
    firstName: z.string().trim().min(1).max(100),
    lastName: optionalText(100),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    addressLine1: optionalText(200),
    city: optionalText(100),
    state: stateSchema.optional(),
    zip: zipSchema.optional(),
    message: optionalText(5000),
    utm: utmSchema.optional(),
  })
  .refine((value) => value.email || value.phone, {
    message: 'Indica al menos un correo o un teléfono',
    path: ['email'],
  });

/** Respuesta única: no da pistas de si el envío se guardó, se marcó como spam o se descartó. */
const GENERIC_OK = { ok: true } as const;

const tooMany: RequestHandler = (_req, res) => {
  res.status(429).json({
    error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados envíos; prueba más tarde' },
  });
};

/**
 * Formulario público de contacto (decisión T26). Va montado ANTES del CSRF global: no usa
 * sesión ni cookies; tiene su propia lista de orígenes (PUBLIC_FORM_ORIGINS) y CORS solo
 * para ellos, sin credenciales. Escribe con `systemDb` (rol app_system).
 */
export function publicRouter({ systemDb: db, env }: AppServices): Router {
  const router = Router();
  const allowed = new Set(env.PUBLIC_FORM_ORIGINS);

  router.use((req, res, next) => {
    const origin = req.get('origin');
    res.vary('Origin');
    if (origin && allowed.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.status(origin && allowed.has(origin) ? 204 : 403).end();
      return;
    }
    next();
  });

  const limiter = (limit: number) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: tooMany,
    });

  router.get('/form-token', limiter(env.PUBLIC_FORM_IP_LIMIT * 6), (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ token: createFormToken(env.BETTER_AUTH_SECRET) });
  });

  router.post(
    '/leads',
    limiter(env.PUBLIC_FORM_IP_LIMIT),
    (req, _res, next) => {
      // CSRF propio: solo los orígenes del sitio público (un navegador siempre envía Origin en POST).
      const origin = req.get('origin');
      if (!origin || !allowed.has(origin)) {
        throw new HttpError(403, 'INVALID_ORIGIN', 'Origen no permitido');
      }
      next();
    },
    express.json({ limit: '20kb' }),
    async (req, res) => {
      const input = parseInput(publicLeadSchema, req.body);

      let spamReason: string | null = null;
      if (input[HONEYPOT_FIELD]?.trim()) spamReason = 'honeypot';
      else {
        const token = checkFormToken(env.BETTER_AUTH_SECRET, input.token);
        if (token !== 'ok') spamReason = `token_${token}`;
      }

      // Límite por correo o teléfono: solo cuentan los envíos válidos (NEW) de las últimas 24 h
      // (la RLS de app_system solo le deja ver los WEB_FORM recientes). Así nadie puede bloquear
      // a una persona mandando envíos falsos con su correo. Pasado el límite, el envío se guarda
      // como SPAM (la oficina lo puede revisar); el límite por IP pone techo a las filas.
      if (!spamReason) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const contacts = [
          ...(input.email ? [{ email: input.email }] : []),
          ...(input.phone ? [{ phone: input.phone }] : []),
        ];
        const recent = await db.lead.count({
          where: { source: 'WEB_FORM', status: 'NEW', createdAt: { gt: since }, OR: contacts },
        });
        if (recent >= env.PUBLIC_FORM_CONTACT_LIMIT) spamReason = 'contact_limit';
      }

      const utm = input.utm && Object.keys(input.utm).length > 0 ? input.utm : undefined;
      const lead = await db.lead.create({
        data: {
          source: 'WEB_FORM',
          status: spamReason ? 'SPAM' : 'NEW',
          ...(spamReason ? { spamReason } : {}),
          firstName: input.firstName,
          ...(input.lastName ? { lastName: input.lastName } : {}),
          ...(input.email ? { email: input.email } : {}),
          ...(input.phone ? { phone: input.phone } : {}),
          ...(input.addressLine1 ? { addressLine1: input.addressLine1 } : {}),
          ...(input.city ? { city: input.city } : {}),
          ...(input.state ? { state: input.state } : {}),
          ...(input.zip ? { zip: input.zip } : {}),
          ...(input.message ? { message: input.message } : {}),
          ...(utm ? { utm } : {}),
        },
        select: { id: true },
      });
      await recordAudit(db, {
        action: spamReason ? 'lead.web_form.spam' : 'lead.web_form',
        entityType: 'lead',
        entityId: lead.id,
        after: spamReason ? { spamReason } : { source: 'WEB_FORM' },
        ...requestMeta(req),
      });
      res.status(201).json(GENERIC_OK);
    },
  );

  return router;
}
