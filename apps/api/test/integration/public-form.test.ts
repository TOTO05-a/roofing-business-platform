import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFormToken } from '../../src/lib/form-token.js';
import {
  APP_ORIGIN,
  createTestContext,
  createTestDb,
  resetDatabase,
  uniqueIp,
  type TestContext,
} from './helpers.js';

const db = createTestDb();
let ctx: TestContext;
const SITE = 'http://localhost:4321';

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db, {
    PUBLIC_FORM_ORIGINS: `${SITE},https://sitio.example`,
    PUBLIC_FORM_IP_LIMIT: '5',
    PUBLIC_FORM_CONTACT_LIMIT: '2',
  });
});

afterAll(async () => {
  await db.$disconnect();
});

/** Un token emitido hace `ageMs` milisegundos con el secreto real de la API. */
const tokenAged = (ageMs: number) =>
  createFormToken(ctx.env.BETTER_AUTH_SECRET, Date.now() - ageMs);

const body = (overrides: Record<string, unknown> = {}) => ({
  token: tokenAged(10_000),
  firstName: 'Lucía',
  lastName: 'Fernández',
  email: 'Lucia.Fernandez@Example.com',
  phone: '(305) 555-0123',
  zip: '33133',
  message: 'Necesito revisar una gotera.',
  ...overrides,
});

function post(payload: unknown, options: { origin?: string | null; ip?: string } = {}) {
  const req = request(ctx.app)
    .post('/api/public/leads')
    .set('X-Forwarded-For', options.ip ?? uniqueIp());
  if (options.origin !== null) req.set('Origin', options.origin ?? SITE);
  return req.send(payload as object);
}

describe('formulario público: token y CORS', () => {
  it('entrega un token firmado y CORS solo para los orígenes permitidos, sin credenciales', async () => {
    const ok = await request(ctx.app)
      .get('/api/public/form-token')
      .set('Origin', SITE)
      .set('X-Forwarded-For', uniqueIp());
    expect(ok.status).toBe(200);
    expect(ok.body.token).toMatch(/^\d+\.[A-Za-z0-9_-]{43}$/);
    expect(ok.headers['access-control-allow-origin']).toBe(SITE);
    expect(ok.headers['access-control-allow-credentials']).toBeUndefined();
    expect(ok.headers['cache-control']).toBe('no-store');

    const foreign = await request(ctx.app)
      .get('/api/public/form-token')
      .set('Origin', 'https://malo.example')
      .set('X-Forwarded-For', uniqueIp());
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('responde al preflight solo a orígenes permitidos', async () => {
    const ok = await request(ctx.app)
      .options('/api/public/leads')
      .set('Origin', SITE)
      .set('Access-Control-Request-Method', 'POST');
    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe(SITE);
    const bad = await request(ctx.app)
      .options('/api/public/leads')
      .set('Origin', 'https://malo.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(bad.status).toBe(403);
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('un origen no permitido, el de la app o sin origen no puede enviar (403)', async () => {
    for (const origin of ['https://malo.example', APP_ORIGIN, null]) {
      const res = await post(body(), { origin });
      expect(res.status, String(origin)).toBe(403);
      expect(res.body.error.code).toBe('INVALID_ORIGIN');
    }
    expect(await db.lead.count()).toBe(0);
  });

  it('el CSRF global sigue cerrado para el resto de rutas de /api', async () => {
    const res = await request(ctx.app).post('/api/leads').set('Origin', SITE).send({});
    expect(res.status).toBe(403);
  });
});

describe('formulario público: envío', () => {
  it('guarda un lead WEB_FORM normalizado y responde 201 genérico', async () => {
    const res = await post(
      body({ utm: { utm_source: 'google', utm_medium: 'cpc', otro: 'x' }, state: 'fl' }),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toEqual({ ok: true });
    const lead = await db.lead.findFirstOrThrow();
    expect(lead).toMatchObject({
      source: 'WEB_FORM',
      status: 'NEW',
      email: 'lucia.fernandez@example.com',
      phone: '+13055550123',
      state: 'FL',
      spamReason: null,
      assignedToId: null,
    });
    expect(lead.utm).toEqual({ utm_source: 'google', utm_medium: 'cpc' });
    expect(await db.auditLog.count({ where: { action: 'lead.web_form', entityId: lead.id } })).toBe(
      1,
    );
  });

  it('valida el contenido: contacto obligatorio, longitudes y teléfono', async () => {
    for (const bad of [
      { email: undefined, phone: undefined },
      { firstName: '' },
      { phone: '12345' },
      { email: 'no-es-correo' },
      { message: 'x'.repeat(5001) },
      { zip: '1' },
    ]) {
      const res = await post(body(bad));
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(await db.lead.count()).toBe(0);
  });

  it('campo trampa lleno: lead SPAM con motivo y misma respuesta', async () => {
    const res = await post(body({ website_url: 'http://spam.example' }));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    expect(await db.lead.findFirstOrThrow()).toMatchObject({
      status: 'SPAM',
      spamReason: 'honeypot',
    });
  });

  it('tiempo mínimo, token caducado, firma falsa o ausente: SPAM con su motivo', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ token: tokenAged(500) }, 'token_too_fast'],
      [{ token: tokenAged(3 * 60 * 60 * 1000) }, 'token_expired'],
      [
        { token: createFormToken('otro-secreto-distinto-0123456789abcdef', Date.now() - 10_000) },
        'token_invalid',
      ],
      [{ token: 'basura' }, 'token_invalid'],
      [{ token: undefined }, 'token_missing'],
    ];
    for (const [index, [override, reason]] of cases.entries()) {
      const res = await post(
        body({ ...override, email: `spam${index}@example.com`, phone: undefined }),
      );
      expect(res.status, reason).toBe(201);
      expect(res.body).toEqual({ ok: true });
      const lead = await db.lead.findFirstOrThrow({ where: { email: `spam${index}@example.com` } });
      expect(lead).toMatchObject({ status: 'SPAM', spamReason: reason });
    }
  });

  it('con el token real recién emitido (menos de 3 s) también es SPAM', async () => {
    const issued = await request(ctx.app)
      .get('/api/public/form-token')
      .set('Origin', SITE)
      .set('X-Forwarded-For', uniqueIp());
    const res = await post(body({ token: issued.body.token }));
    expect(res.status).toBe(201);
    expect((await db.lead.findFirstOrThrow()).spamReason).toBe('token_too_fast');
  });

  it('límite por correo: pasado el máximo en 24 h se guarda como SPAM, con la misma respuesta', async () => {
    for (let i = 0; i < 2; i += 1) {
      expect((await post(body({ phone: undefined }))).status).toBe(201);
    }
    const third = await post(body({ phone: undefined }));
    expect(third.status).toBe(201);
    expect(third.body).toEqual({ ok: true });
    const countNew = () => db.lead.count({ where: { status: 'NEW' } });
    expect(await countNew()).toBe(2);
    expect(await db.lead.count({ where: { spamReason: 'contact_limit' } })).toBe(1);
    // Otro correo sigue pudiendo enviar.
    expect((await post(body({ email: 'otra@example.com', phone: undefined }))).status).toBe(201);
    expect(await countNew()).toBe(3);
    // Los envíos de hace más de 24 h no cuentan.
    await db.lead.updateMany({
      where: { email: 'lucia.fernandez@example.com' },
      data: { createdAt: new Date(Date.now() - 25 * 3_600_000) },
    });
    expect((await post(body({ phone: undefined }))).status).toBe(201);
    expect(await countNew()).toBe(4);
  });

  it('los envíos falsos (SPAM) con el correo de alguien no bloquean sus envíos reales', async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await post(body({ phone: undefined, token: 'falso' }))).status).toBe(201);
    }
    expect(await db.lead.count({ where: { status: 'SPAM' } })).toBe(3);
    expect((await post(body({ phone: undefined }))).status).toBe(201);
    expect(await db.lead.count({ where: { status: 'NEW' } })).toBe(1);
  });

  it('límite por IP: 429 al pasar el máximo', async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 5; i += 1) {
      expect(
        (await post(body({ email: `ip${i}@example.com`, phone: undefined }), { ip })).status,
      ).toBe(201);
    }
    const blocked = await post(body({ email: 'ip9@example.com', phone: undefined }), { ip });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect((await post(body({ email: 'ip10@example.com', phone: undefined }))).status).toBe(201);
  });
});
