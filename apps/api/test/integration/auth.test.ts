import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  APP_ORIGIN,
  createTestContext,
  createTestDb,
  createUser,
  linkFrom,
  newAgent,
  resetDatabase,
  signIn,
  waitForMail,
  type TestContext,
} from './helpers.js';

const db = createTestDb();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});

afterAll(async () => {
  await db.$disconnect();
});

function cookieHeader(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

describe('inicio de sesión con correo y contraseña', () => {
  it('con credenciales correctas crea una sesión en cookie httpOnly y SameSite=Lax', async () => {
    const user = await createUser(db, { role: 'CUSTOMER', email: 'cliente@example.com' });
    const agent = newAgent(ctx.app);

    const res = await signIn(agent, 'CLIENTE@Example.com', user.password);
    expect(res.status).toBe(200);
    const sessionCookie = cookieHeader(res).find((c) => c.includes('session_token='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    // En pruebas (no producción) la cookie no lleva Secure.
    expect(sessionCookie).not.toMatch(/;\s*Secure/i);

    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body).toEqual({
      user: {
        id: user.id,
        email: user.email,
        name: 'Usuario CUSTOMER',
        role: 'CUSTOMER',
        emailVerified: true,
        twoFactorEnabled: false,
      },
      customerId: user.customerId,
      employeeId: null,
      twoFactorRequired: false,
    });
  });

  it('registra el inicio de sesión en la auditoría con la IP del cliente', async () => {
    const user = await createUser(db);
    const agent = newAgent(ctx.app, '203.0.113.7');
    expect((await signIn(agent, user.email, user.password)).status).toBe(200);

    const entry = await db.auditLog.findFirst({ where: { action: 'auth.sign_in' } });
    expect(entry).toMatchObject({
      actorUserId: user.id,
      entityType: 'session',
      ip: '203.0.113.7',
      userAgent: 'roofing-integration-tests',
    });
  });

  it('con contraseña incorrecta responde 401 y no crea sesión', async () => {
    const user = await createUser(db);
    const agent = newAgent(ctx.app);

    const res = await signIn(agent, user.email, 'contraseña-equivocada');
    expect(res.status).toBe(401);
    expect(
      cookieHeader(res).some((c) => c.includes('session_token=') && !c.includes('Max-Age=0')),
    ).toBe(false);
    expect((await agent.get('/api/me')).status).toBe(401);
    expect(await db.session.count()).toBe(0);
  });

  it('con un correo inexistente responde igual que con contraseña incorrecta', async () => {
    const res = await signIn(newAgent(ctx.app), 'nadie@example.com', 'contraseña-cualquiera');
    expect(res.status).toBe(401);
  });

  it('limita los intentos: el sexto en un minuto desde la misma IP recibe 429', async () => {
    const user = await createUser(db);
    const agent = newAgent(ctx.app, '203.0.113.50');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await signIn(agent, user.email, 'contraseña-equivocada')).status).toBe(401);
    }
    const blocked = await signIn(agent, user.email, user.password);
    expect(blocked.status).toBe(429);
    // Otra IP no está afectada.
    expect((await signIn(newAgent(ctx.app), user.email, user.password)).status).toBe(200);
  });

  it('un usuario desactivado no puede iniciar sesión', async () => {
    const user = await createUser(db, { status: 'DISABLED' });
    const res = await signIn(newAgent(ctx.app), user.email, user.password);
    expect(res.status).toBe(403);
    expect(await db.session.count()).toBe(0);
  });

  it('rechaza el inicio de sesión desde un origen no confiable (CSRF)', async () => {
    const user = await createUser(db);
    const res = await newAgent(ctx.app)
      .set('Origin', 'https://evil.example')
      .post('/api/auth/sign-in/email')
      .send({ email: user.email, password: user.password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVALID_ORIGIN');
    expect(await db.session.count()).toBe(0);
  });
});

describe('registro abierto', () => {
  it('está deshabilitado: solo se entra por invitación', async () => {
    const res = await newAgent(ctx.app)
      .post('/api/auth/sign-up/email')
      .send({ email: 'intruso@example.com', password: 'contraseña-larga-123', name: 'Intruso' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await db.user.count()).toBe(0);
  });

  it('no permite fijar el rol desde el cliente', async () => {
    const user = await createUser(db);
    const agent = newAgent(ctx.app);
    await signIn(agent, user.email, user.password);
    await agent.post('/api/auth/update-user').send({ role: 'SUPERADMIN', name: 'Nuevo nombre' });
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.role).toBe('CUSTOMER');
  });
});

describe('verificación de correo', () => {
  it('un correo sin verificar no puede entrar y recibe el enlace de verificación', async () => {
    const user = await createUser(db, { emailVerified: false });
    const agent = newAgent(ctx.app);

    const res = await signIn(agent, user.email, user.password);
    expect(res.status).toBe(403);
    expect(await db.session.count()).toBe(0);

    const link = linkFrom(await waitForMail(ctx, user.email));
    expect(link.origin).toBe(APP_ORIGIN);
    const verify = await agent.get(link.pathname + link.search);
    expect(verify.status).toBeLessThan(400);
    // No inicia sesión automáticamente (evitaría el 2FA de los administradores).
    expect(await db.session.count()).toBe(0);

    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.emailVerified).toBe(true);
    expect((await signIn(agent, user.email, user.password)).status).toBe(200);
  });
});

describe('recuperación de contraseña', () => {
  it('envía un enlace de un solo uso, cambia la contraseña y cierra las sesiones', async () => {
    const user = await createUser(db);
    const oldSession = newAgent(ctx.app);
    expect((await signIn(oldSession, user.email, user.password)).status).toBe(200);

    const agent = newAgent(ctx.app);
    const request = await agent
      .post('/api/auth/request-password-reset')
      .send({ email: user.email, redirectTo: `${APP_ORIGIN}/restablecer` });
    expect(request.status).toBe(200);

    const link = linkFrom(await waitForMail(ctx, user.email));
    const token = link.pathname.split('/').at(-1);
    expect(token).toBeTruthy();

    const newPassword = 'una-contraseña-nueva-456';
    const reset = await agent.post('/api/auth/reset-password').send({ token, newPassword });
    expect(reset.status).toBe(200);

    expect((await oldSession.get('/api/me')).status).toBe(401);
    expect((await signIn(newAgent(ctx.app), user.email, user.password)).status).toBe(401);
    expect((await signIn(newAgent(ctx.app), user.email, newPassword)).status).toBe(200);

    const reuse = await agent
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'otra-contraseña-789' });
    expect(reuse.status).toBe(400);
  });

  it('responde igual para un correo inexistente (no revela cuentas)', async () => {
    const res = await newAgent(ctx.app)
      .post('/api/auth/request-password-reset')
      .send({ email: 'nadie@example.com', redirectTo: `${APP_ORIGIN}/restablecer` });
    expect(res.status).toBe(200);
    expect(ctx.mail).toHaveLength(0);
  });
});
