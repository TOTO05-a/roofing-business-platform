import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { EXAMPLE_S3_SECRET, parseEnv } from '../src/env.js';
import { createServices } from '../src/services.js';

// Estas pruebas no tocan la base de datos: Prisma solo conecta en la primera consulta.
const env = parseEnv({
  NODE_ENV: 'test',
  APP_DATABASE_URL: 'postgresql://user:pass@127.0.0.1:1/unused',
  SYSTEM_DATABASE_URL: 'postgresql://user:pass@127.0.0.1:1/unused',
  BETTER_AUTH_SECRET: 'unit-test-secret-unit-test-secret-1234',
});
const app = createApp(createServices(env, { mailer: { send: async () => {} } }));

describe('GET /api/health', () => {
  it('responde {status:"ok"}', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('envía cabeceras de helmet', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('rutas desconocidas', () => {
  it('devuelve 404 en JSON', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' },
    });
  });
});

describe('manejo de errores', () => {
  it('responde 400 JSON ante un cuerpo JSON inválido', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Origin', 'http://localhost:5173')
      .set('Content-Type', 'application/json')
      .send('{malformado');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});

describe('protección CSRF de las rutas propias', () => {
  it('rechaza un POST sin cabecera Origin', async () => {
    const res = await request(app).post('/api/invitations/accept').send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVALID_ORIGIN');
  });

  it('rechaza un POST desde un origen no confiable', async () => {
    const res = await request(app)
      .post('/api/invitations/accept')
      .set('Origin', 'https://evil.example')
      .send({});
    expect(res.status).toBe(403);
  });

  it('también protege los endpoints de Better Auth (login CSRF)', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .set('Origin', 'https://evil.example')
      .send({ email: 'a@example.com', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVALID_ORIGIN');
  });

  it('deja pasar el origen de la app hasta la validación', async () => {
    const res = await request(app)
      .post('/api/invitations/accept')
      .set('Origin', 'http://localhost:5173')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('parseEnv', () => {
  const required = {
    NODE_ENV: 'development',
    APP_DATABASE_URL: 'postgresql://app_user:p@localhost:5432/db',
    SYSTEM_DATABASE_URL: 'postgresql://app_system:p@localhost:5432/db',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
  };

  it('aplica valores por defecto', () => {
    expect(parseEnv(required)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      APP_URL: 'http://localhost:5173',
      TRUST_PROXY: 0,
      SMTP_HOST: 'localhost',
      SMTP_PORT: 1025,
      SMTP_SECURE: false,
      TRUSTED_ORIGINS: [],
      INVITATION_TTL_HOURS: 72,
    });
  });

  it('trata las variables vacías como no definidas', () => {
    const env = parseEnv({ ...required, SMTP_USER: '', TRUSTED_ORIGINS: '' });
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.TRUSTED_ORIGINS).toEqual([]);
  });

  it('rechaza un PORT inválido', () => {
    expect(() => parseEnv({ ...required, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('exige NODE_ENV, las dos conexiones y un secreto de al menos 32 caracteres', () => {
    expect(() => parseEnv({})).toThrow(/NODE_ENV[\s\S]*APP_DATABASE_URL[\s\S]*SYSTEM_DATABASE_URL/);
    expect(() => parseEnv({ ...required, BETTER_AUTH_SECRET: 'corto' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it('rechaza en producción el secreto de ejemplo de .env.example', () => {
    const production = {
      ...required,
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'https://app.example.com',
      APP_URL: 'https://app.example.com',
      SMTP_HOST: 'smtp.example.com',
    };
    expect(() =>
      parseEnv({ ...production, BETTER_AUTH_SECRET: 'cambia-esto-por-un-secreto-aleatorio-de-32' }),
    ).toThrow(/BETTER_AUTH_SECRET/);
    expect(parseEnv(production).NODE_ENV).toBe('production');
  });

  it('rechaza en producción las contraseñas y la clave S3 de .env.example', () => {
    const production = {
      ...required,
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'https://app.example.com',
      APP_URL: 'https://app.example.com',
      SMTP_HOST: 'smtp.example.com',
    };
    expect(() =>
      parseEnv({
        ...production,
        APP_DATABASE_URL: 'postgresql://app_user:app_user_dev_password@db.example.com:5432/db',
      }),
    ).toThrow(/APP_DATABASE_URL/);
    expect(() =>
      parseEnv({
        ...production,
        SYSTEM_DATABASE_URL: 'postgresql://app_system:app_system_dev_password@db.example.com/db',
      }),
    ).toThrow(/SYSTEM_DATABASE_URL/);
    expect(() => parseEnv({ ...production, S3_SECRET_ACCESS_KEY: EXAMPLE_S3_SECRET })).toThrow(
      /S3_SECRET_ACCESS_KEY/,
    );
  });

  it('exige https y SMTP real en producción', () => {
    expect(() => parseEnv({ ...required, NODE_ENV: 'production' })).toThrow(
      /BETTER_AUTH_URL[\s\S]*APP_URL[\s\S]*SMTP_HOST/,
    );
  });
});
