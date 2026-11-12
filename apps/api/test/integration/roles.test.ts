import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '../../src/auth/roles.js';
import {
  createTestContext,
  createTestDb,
  createUser,
  newAgent,
  resetDatabase,
  signIn,
  signInWithTwoFactor,
  type Agent,
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

async function signedInAs(role: Role): Promise<Agent> {
  if (role === 'ADMIN' || role === 'SUPERADMIN') {
    return (await signInWithTwoFactor(ctx, role)).agent;
  }
  const user = await createUser(db, { role });
  const agent = newAgent(ctx.app);
  expect((await signIn(agent, user.email, user.password)).status).toBe(200);
  return agent;
}

describe('acceso a la administración por rol', () => {
  it('sin sesión responde 401', async () => {
    const agent = newAgent(ctx.app);
    expect((await agent.get('/api/admin/users')).status).toBe(401);
    expect((await agent.post('/api/admin/invitations').send({})).status).toBe(401);
  });

  it.each(['CLIENTE', 'EMPLEADO', 'ADMIN'] as const)(
    '%s recibe 403 en las rutas de superadmin',
    async (role) => {
      const agent = await signedInAs(role);
      const target = await createUser(db);

      const list = await agent.get('/api/admin/users');
      expect(list.status).toBe(403);
      expect(list.body.error.code).toBe('FORBIDDEN');
      expect(
        (await agent.post('/api/admin/invitations').send({ email: 'x@example.com', role: 'ADMIN' }))
          .status,
      ).toBe(403);
      expect(
        (await agent.patch(`/api/admin/users/${target.id}`).send({ role: 'SUPERADMIN' })).status,
      ).toBe(403);
      expect(await db.invitation.count()).toBe(0);
      expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe('CLIENTE');
    },
  );
});

describe('gestión de usuarios (SUPERADMIN)', () => {
  it('lista usuarios paginados y filtra por rol', async () => {
    const { agent } = await signInWithTwoFactor(ctx);
    await createUser(db, { role: 'CLIENTE' });
    await createUser(db, { role: 'CLIENTE' });
    await createUser(db, { role: 'EMPLEADO' });

    const all = await agent.get('/api/admin/users?pageSize=2');
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ page: 1, pageSize: 2, total: 4 });
    expect(all.body.users).toHaveLength(2);
    // Nunca expone hashes ni secretos.
    expect(JSON.stringify(all.body)).not.toMatch(/password|secret|scrypt/i);

    const clients = await agent.get('/api/admin/users?role=CLIENTE');
    expect(clients.body.total).toBe(2);

    expect((await agent.get('/api/admin/users?role=OTRO')).status).toBe(400);
  });

  it('cambia el rol, cierra las sesiones de esa persona y lo audita', async () => {
    const { agent, user: actor } = await signInWithTwoFactor(ctx);
    const target = await createUser(db, { role: 'CLIENTE' });
    const targetAgent = newAgent(ctx.app);
    await signIn(targetAgent, target.email, target.password);

    const res = await agent.patch(`/api/admin/users/${target.id}`).send({ role: 'EMPLEADO' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: target.id, role: 'EMPLEADO', active: true });
    expect((await targetAgent.get('/api/me')).status).toBe(401);

    const entry = await db.auditLog.findFirstOrThrow({ where: { action: 'user.role_change' } });
    expect(entry).toMatchObject({
      actorId: actor.id,
      actorEmail: actor.email,
      entityType: 'user',
      entityId: target.id,
      metadata: { from: 'CLIENTE', to: 'EMPLEADO' },
    });
    expect(entry.ip).toMatch(/^198\.51\.100\./);
  });

  it('desactiva a un usuario: pierde la sesión, no puede volver a entrar y queda auditado', async () => {
    const { agent } = await signInWithTwoFactor(ctx);
    const target = await createUser(db, { role: 'EMPLEADO' });
    const targetAgent = newAgent(ctx.app);
    await signIn(targetAgent, target.email, target.password);

    const res = await agent.patch(`/api/admin/users/${target.id}`).send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.user.active).toBe(false);

    expect((await targetAgent.get('/api/me')).status).toBe(401);
    expect((await signIn(newAgent(ctx.app), target.email, target.password)).status).toBe(403);
    expect(
      await db.auditLog.count({ where: { action: 'user.deactivate', entityId: target.id } }),
    ).toBe(1);

    const reactivate = await agent.patch(`/api/admin/users/${target.id}`).send({ active: true });
    expect(reactivate.status).toBe(200);
    expect(await db.auditLog.count({ where: { action: 'user.activate' } })).toBe(1);
    expect((await signIn(newAgent(ctx.app), target.email, target.password)).status).toBe(200);
  });

  it('no permite cambiarse el rol ni desactivarse a sí mismo', async () => {
    const { agent, user } = await signInWithTwoFactor(ctx);
    const res = await agent.patch(`/api/admin/users/${user.id}`).send({ active: false });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANNOT_MODIFY_SELF');
  });

  it('valida el cuerpo y el id', async () => {
    const { agent } = await signInWithTwoFactor(ctx);
    const target = await createUser(db);
    expect((await agent.patch(`/api/admin/users/${target.id}`).send({})).status).toBe(400);
    expect(
      (await agent.patch(`/api/admin/users/${target.id}`).send({ role: 'CLIENTE', extra: 1 }))
        .status,
    ).toBe(400);
    expect((await agent.patch('/api/admin/users/no-es-uuid').send({ active: false })).status).toBe(
      400,
    );
    const missing = await agent
      .patch('/api/admin/users/0190f0a0-0000-7000-8000-000000000000')
      .send({ active: false });
    expect(missing.status).toBe(404);
  });
});
