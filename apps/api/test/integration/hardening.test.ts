import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestContext,
  createTestDb,
  createUser,
  enableTwoFactor,
  newAgent,
  resetDatabase,
  signIn,
  totpCode,
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

describe('endurecimiento de Better Auth', () => {
  it('rechaza cuerpos demasiado grandes en /api/auth antes de leerlos', async () => {
    const res = await newAgent(ctx.app)
      .post('/api/auth/sign-in/email')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@example.com', password: 'x'.repeat(200_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it.each([
    '/verify-password',
    '/sign-up/email',
    '/change-email',
    '/delete-user',
    '/two-factor/send-otp',
  ])('el endpoint %s está desactivado', async (path) => {
    const user = await createUser(db);
    const agent = newAgent(ctx.app);
    await signIn(agent, user.email, user.password);
    const res = await agent.post(`/api/auth${path}`).send({ password: user.password });
    expect(res.status).toBe(404);
  });

  it('/update-user solo permite cambiar el nombre, con longitud acotada', async () => {
    const user = await createUser(db);
    const agent = newAgent(ctx.app);
    await signIn(agent, user.email, user.password);

    const withImage = await agent.post('/api/auth/update-user').send({ image: 'https://x/y.png' });
    expect(withImage.status).toBe(400);
    const longName = await agent.post('/api/auth/update-user').send({ name: 'n'.repeat(101) });
    expect(longName.status).toBe(400);
    const ok = await agent.post('/api/auth/update-user').send({ name: 'Nombre nuevo' });
    expect(ok.status).toBe(200);

    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored).toMatchObject({ name: 'Nombre nuevo', image: null });
  });

  it('no permite "confiar en este dispositivo" para saltarse el 2FA', async () => {
    const user = await createUser(db, { role: 'ADMIN' });
    const first = newAgent(ctx.app);
    await signIn(first, user.email, user.password);
    const secret = await enableTwoFactor(first, user.password);

    const agent = newAgent(ctx.app);
    expect((await signIn(agent, user.email, user.password)).body.twoFactorRedirect).toBe(true);
    const res = await agent
      .post('/api/auth/two-factor/verify-totp')
      .send({ code: totpCode(secret, Date.now() + 30_000), trustDevice: true });
    expect(res.status).toBe(400);
    expect((await agent.get('/api/me')).status).toBe(401);
  });

  it('con 2FA, validar solo la contraseña no se audita como inicio de sesión', async () => {
    const user = await createUser(db, { role: 'SUPERADMIN' });
    const first = newAgent(ctx.app);
    await signIn(first, user.email, user.password);
    const secret = await enableTwoFactor(first, user.password);
    const signIns = await db.auditLog.count({ where: { action: 'auth.sign_in' } });

    const agent = newAgent(ctx.app);
    await signIn(agent, user.email, user.password);
    expect(await db.auditLog.count({ where: { action: 'auth.sign_in' } })).toBe(signIns);
    expect(await db.auditLog.count({ where: { action: 'auth.password_verified' } })).toBe(1);

    const verify = await agent
      .post('/api/auth/two-factor/verify-totp')
      .send({ code: totpCode(secret, Date.now() + 30_000) });
    expect(verify.status).toBe(200);
    expect(await db.auditLog.count({ where: { action: 'auth.sign_in' } })).toBe(signIns + 1);
  });
});
