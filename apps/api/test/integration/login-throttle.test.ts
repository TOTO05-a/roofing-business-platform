import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { LOGIN_MAX_FAILURES } from '../../src/auth/login-throttle.js';
import {
  createTestContext,
  createTestDb,
  createUser,
  enableTwoFactor,
  newAgent,
  resetDatabase,
  signIn,
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

/** Fallos desde IP distintas: así el límite por IP no interviene y se prueba el de por cuenta. */
async function failLogins(email: string, times: number): Promise<void> {
  for (let attempt = 0; attempt < times; attempt += 1) {
    const res = await signIn(newAgent(ctx.app), email, 'contraseña-equivocada');
    expect(res.status).toBe(401);
  }
}

describe('límite de intentos de login por cuenta', () => {
  it(`bloquea la cuenta tras ${LOGIN_MAX_FAILURES} fallos, aunque vengan de IP distintas`, async () => {
    const user = await createUser(db);
    await failLogins(user.email, LOGIN_MAX_FAILURES);

    const blocked = await signIn(newAgent(ctx.app), user.email, user.password);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_ATTEMPTS');
    expect(await db.session.count()).toBe(0);
    // Mayúsculas y espacios no esquivan el bloqueo.
    const variant = await signIn(
      newAgent(ctx.app),
      `  ${user.email.toUpperCase()} `,
      user.password,
    );
    expect(variant.status).toBe(429);

    const entry = await db.auditLog.findFirstOrThrow({ where: { action: 'auth.account_locked' } });
    expect(entry).toMatchObject({ entityType: 'login_throttle', entityId: user.email });
  });

  it('responde igual para un correo que no existe (no revela qué cuentas hay)', async () => {
    const user = await createUser(db);
    await failLogins(user.email, LOGIN_MAX_FAILURES);
    await failLogins('nadie@example.com', LOGIN_MAX_FAILURES);

    const existing = await signIn(newAgent(ctx.app), user.email, 'x'.repeat(12));
    const missing = await signIn(newAgent(ctx.app), 'nadie@example.com', 'x'.repeat(12));
    expect(missing.status).toBe(existing.status);
    expect(missing.body).toEqual(existing.body);
  });

  it('un login correcto reinicia el contador', async () => {
    const user = await createUser(db);
    await failLogins(user.email, LOGIN_MAX_FAILURES - 1);
    expect((await signIn(newAgent(ctx.app), user.email, user.password)).status).toBe(200);
    expect(await db.loginThrottle.count()).toBe(0);

    await failLogins(user.email, LOGIN_MAX_FAILURES - 1);
    expect((await signIn(newAgent(ctx.app), user.email, user.password)).status).toBe(200);
  });

  it('el bloqueo caduca a los 15 minutos', async () => {
    const user = await createUser(db);
    await failLogins(user.email, LOGIN_MAX_FAILURES);
    await db.loginThrottle.update({
      where: { email: user.email },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    expect((await signIn(newAgent(ctx.app), user.email, user.password)).status).toBe(200);
  });
});

describe('auditoría de la seguridad de la cuenta', () => {
  it('registra la activación y desactivación del 2FA y el cambio de contraseña', async () => {
    const user = await createUser(db, { role: 'EMPLOYEE' });
    const agent = newAgent(ctx.app);
    expect((await signIn(agent, user.email, user.password)).status).toBe(200);

    await enableTwoFactor(agent, user.password);
    expect(
      await db.auditLog.count({
        where: { action: 'auth.two_factor_enable', actorUserId: user.id },
      }),
    ).toBe(1);

    const disable = await agent
      .post('/api/auth/two-factor/disable')
      .send({ password: user.password });
    expect(disable.status, JSON.stringify(disable.body)).toBe(200);
    expect(
      await db.auditLog.count({
        where: { action: 'auth.two_factor_disable', actorUserId: user.id },
      }),
    ).toBe(1);

    const change = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: user.password, newPassword: 'otra-contraseña-segura-1' });
    expect(change.status, JSON.stringify(change.body)).toBe(200);
    const entry = await db.auditLog.findFirstOrThrow({ where: { action: 'auth.password_change' } });
    expect(entry).toMatchObject({ actorUserId: user.id, entityId: user.id });
    expect(entry.ip).toMatch(/^198\.51\.100\./);
  });
});
