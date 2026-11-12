import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../../src/lib/tokens.js';
import {
  APP_ORIGIN,
  createTestContext,
  createTestDb,
  createUser,
  linkFrom,
  newAgent,
  resetDatabase,
  signIn,
  signInWithTwoFactor,
  type Agent,
  type TestContext,
} from './helpers.js';

const db = createTestDb();
let ctx: TestContext;
let superadmin: Agent;
let superadminId: string;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
  const session = await signInWithTwoFactor(ctx, 'SUPERADMIN');
  superadmin = session.agent;
  superadminId = session.user.id;
});

afterAll(async () => {
  await db.$disconnect();
});

async function invite(email: string, role: string): Promise<string> {
  const res = await superadmin.post('/api/admin/invitations').send({ email, role });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const link = linkFrom(ctx.mail.filter((m) => m.to === email.trim().toLowerCase()).at(-1));
  expect(link.origin).toBe(APP_ORIGIN);
  expect(link.pathname).toBe('/invitacion');
  const token = new URLSearchParams(link.hash.slice(1)).get('token');
  expect(token).toBeTruthy();
  return token as string;
}

function accept(token: string, password = 'contraseña-nueva-123') {
  return newAgent(ctx.app)
    .post('/api/invitations/accept')
    .send({ token, name: 'Cliente Invitado', password });
}

describe('invitaciones', () => {
  it('el superadmin invita, la persona crea su cuenta y puede iniciar sesión con su rol', async () => {
    const token = await invite('  Nuevo.Cliente@Example.com ', 'CLIENTE');

    const stored = await db.invitation.findFirstOrThrow();
    expect(stored).toMatchObject({ email: 'nuevo.cliente@example.com', role: 'CLIENTE' });
    // Solo se guarda el hash del token, nunca el token.
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toContain(token);
    // Caduca a las 72 horas (INVITATION_TTL_HOURS por defecto).
    const hoursLeft = (stored.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hoursLeft).toBeGreaterThan(71.9);
    expect(hoursLeft).toBeLessThanOrEqual(72);

    const res = await accept(token);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'nuevo.cliente@example.com', role: 'CLIENTE' });

    const user = await db.user.findUniqueOrThrow({ where: { email: 'nuevo.cliente@example.com' } });
    expect(user.emailVerified).toBe(true);
    const used = await db.invitation.findUniqueOrThrow({ where: { id: stored.id } });
    expect(used.usedAt).not.toBeNull();
    expect(used.acceptedUserId).toBe(user.id);

    const agent = newAgent(ctx.app);
    expect((await signIn(agent, user.email, 'contraseña-nueva-123')).status).toBe(200);
    expect((await agent.get('/api/me')).body.user.role).toBe('CLIENTE');
  });

  it('registra la creación y la aceptación en la auditoría', async () => {
    const token = await invite('auditado@example.com', 'EMPLEADO');
    await accept(token);
    const invitation = await db.invitation.findFirstOrThrow();

    const created = await db.auditLog.findFirstOrThrow({ where: { action: 'invitation.create' } });
    expect(created).toMatchObject({
      actorId: superadminId,
      entityType: 'invitation',
      entityId: invitation.id,
      metadata: { email: 'auditado@example.com', role: 'EMPLEADO', replaced: 0 },
    });
    expect(created.ip).toMatch(/^198\.51\.100\./);

    const accepted = await db.auditLog.findFirstOrThrow({ where: { action: 'invitation.accept' } });
    expect(accepted).toMatchObject({
      actorId: invitation.acceptedUserId,
      entityId: invitation.id,
    });
  });

  it('es de un solo uso', async () => {
    const token = await invite('una-vez@example.com', 'CLIENTE');
    expect((await accept(token)).status).toBe(201);

    const reuse = await accept(token, 'otra-contraseña-456');
    expect(reuse.status).toBe(410);
    expect(reuse.body.error.code).toBe('INVITATION_USED');
    expect(await db.user.count({ where: { email: 'una-vez@example.com' } })).toBe(1);
  });

  it('no se puede usar dos veces aunque las peticiones lleguen a la vez', async () => {
    const token = await invite('carrera@example.com', 'CLIENTE');
    const results = await Promise.all([accept(token), accept(token), accept(token)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(await db.user.count({ where: { email: 'carrera@example.com' } })).toBe(1);
  });

  it('caducada, se rechaza y no crea la cuenta', async () => {
    const token = await invite('caducada@example.com', 'CLIENTE');
    await db.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await accept(token);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('INVITATION_EXPIRED');
    expect(await db.user.count({ where: { email: 'caducada@example.com' } })).toBe(0);
  });

  it('con un token inventado responde 404', async () => {
    const res = await accept('token-que-no-existe-0123456789');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INVITATION_INVALID');
  });

  it('una invitación nueva reemplaza a la pendiente del mismo correo', async () => {
    const first = await invite('repetido@example.com', 'CLIENTE');
    const second = await invite('repetido@example.com', 'EMPLEADO');
    expect(await db.invitation.count()).toBe(1);

    expect((await accept(first)).status).toBe(404);
    const res = await accept(second);
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('EMPLEADO');
  });

  it('no invita a un correo que ya tiene cuenta', async () => {
    const existing = await createUser(db);
    const res = await superadmin
      .post('/api/admin/invitations')
      .send({ email: existing.email, role: 'CLIENTE' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USER_EXISTS');
  });

  it('valida la entrada con Zod', async () => {
    const res = await superadmin
      .post('/api/admin/invitations')
      .send({ email: 'no-es-un-correo', role: 'DUEÑO' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.issues.map((i: { path: string }) => i.path).sort()).toEqual([
      'email',
      'role',
    ]);

    const weak = await accept('x'.repeat(43), 'corta');
    expect(weak.status).toBe(400);
  });
});
