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

describe('2FA obligatorio para ADMIN y SUPERADMIN', () => {
  it.each(['ADMIN', 'SUPERADMIN'] as const)(
    '%s sin 2FA solo puede ver /api/me y debe activarlo',
    async (role) => {
      const user = await createUser(db, { role });
      const agent = newAgent(ctx.app);
      expect((await signIn(agent, user.email, user.password)).status).toBe(200);

      const me = await agent.get('/api/me');
      expect(me.status).toBe(200);
      expect(me.body.twoFactorRequired).toBe(true);

      const admin = await agent.get('/api/admin/users');
      expect(admin.status).toBe(403);
      expect(admin.body.error.code).toBe('TWO_FACTOR_REQUIRED');
    },
  );

  it('los roles no privilegiados no necesitan 2FA', async () => {
    const user = await createUser(db, { role: 'EMPLOYEE' });
    const agent = newAgent(ctx.app);
    await signIn(agent, user.email, user.password);
    expect((await agent.get('/api/me')).body.twoFactorRequired).toBe(false);
  });

  it('tras activar TOTP, el superadmin accede y cada nuevo inicio de sesión exige el código', async () => {
    const user = await createUser(db, { role: 'SUPERADMIN' });
    const first = newAgent(ctx.app);
    await signIn(first, user.email, user.password);
    const secret = await enableTwoFactor(first, user.password);

    const enrolled = await first.get('/api/me');
    expect(enrolled.body.user.twoFactorEnabled).toBe(true);
    expect(enrolled.body.twoFactorRequired).toBe(false);
    expect((await first.get('/api/admin/users')).status).toBe(200);

    // El secreto TOTP se guarda cifrado, no en claro.
    const stored = await db.twoFactor.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.secret).not.toContain(secret);

    // Nuevo inicio de sesión: la contraseña sola no da sesión.
    const agent = newAgent(ctx.app);
    const login = await signIn(agent, user.email, user.password);
    expect(login.status).toBe(200);
    expect(login.body.twoFactorRedirect).toBe(true);
    expect((await agent.get('/api/me')).status).toBe(401);

    const wrong = await agent.post('/api/auth/two-factor/verify-totp').send({ code: '000000' });
    expect(wrong.status).toBe(401);
    expect((await agent.get('/api/me')).status).toBe(401);

    // Código del periodo siguiente (también aceptado) para no repetir el del enrolamiento.
    const ok = await agent
      .post('/api/auth/two-factor/verify-totp')
      .send({ code: totpCode(secret, Date.now() + 30_000) });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('SUPERADMIN');
    expect((await agent.get('/api/admin/users')).status).toBe(200);
  });

  it('el enlace de verificación de correo no evita el segundo factor', async () => {
    const user = await createUser(db, { role: 'ADMIN' });
    const agent = newAgent(ctx.app);
    await signIn(agent, user.email, user.password);
    await enableTwoFactor(agent, user.password);
    await db.session.deleteMany();

    const login = await signIn(newAgent(ctx.app), user.email, user.password);
    expect(login.body.twoFactorRedirect).toBe(true);
    expect(await db.session.count()).toBe(0);
  });
});
