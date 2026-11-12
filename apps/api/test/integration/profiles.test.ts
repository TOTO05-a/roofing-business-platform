import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createCustomerProfile,
  createTestContext,
  createTestDb,
  createUser,
  linkFrom,
  newAgent,
  resetDatabase,
  signIn,
  signInWithTwoFactor,
  type Agent,
  type CreatedUser,
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

async function signedIn(user: CreatedUser): Promise<Agent> {
  const agent = newAgent(ctx.app);
  expect((await signIn(agent, user.email, user.password)).status).toBe(200);
  return agent;
}

function tokenFrom(email: string): string {
  const link = linkFrom(ctx.mail.filter((m) => m.to === email).at(-1));
  return new URLSearchParams(link.hash.slice(1)).get('token') as string;
}

describe('AuthContext y filtro de alcance', () => {
  it('GET /api/me devuelve el perfil enlazado de clientes y empleados', async () => {
    const customer = await createUser(db, { role: 'CUSTOMER' });
    const employee = await createUser(db, { role: 'EMPLOYEE' });
    const customerMe = await (await signedIn(customer)).get('/api/me');
    expect(customerMe.body).toMatchObject({ customerId: customer.customerId, employeeId: null });
    const employeeMe = await (await signedIn(employee)).get('/api/me');
    expect(employeeMe.body).toMatchObject({ customerId: null, employeeId: employee.employeeId });
  });

  it('un cliente ve su perfil y recibe 404 (no 403) con el de otro cliente', async () => {
    const alice = await createUser(db, { role: 'CUSTOMER' });
    const bob = await createUser(db, { role: 'CUSTOMER' });
    const agent = await signedIn(alice);

    const own = await agent.get(`/api/customers/${alice.customerId}`);
    expect(own.status).toBe(200);
    expect(own.body.customer.id).toBe(alice.customerId);

    const other = await agent.get(`/api/customers/${bob.customerId}`);
    const missing = await agent.get('/api/customers/0190f0a0-0000-7000-8000-000000000000');
    expect(other.status).toBe(404);
    // Mismo cuerpo que un recurso inexistente: no revela que el otro cliente existe.
    expect(other.body).toEqual(missing.body);

    const list = await agent.get('/api/customers');
    expect(list.body.total).toBe(1);
    expect(list.body.customers[0].id).toBe(alice.customerId);
  });

  it('un empleado ve su perfil, no el de otros empleados ni clientes', async () => {
    const employee = await createUser(db, { role: 'EMPLOYEE' });
    const other = await createUser(db, { role: 'EMPLOYEE' });
    const customer = await createUser(db, { role: 'CUSTOMER' });
    const agent = await signedIn(employee);

    expect((await agent.get(`/api/employees/${employee.employeeId}`)).status).toBe(200);
    expect((await agent.get(`/api/employees/${other.employeeId}`)).status).toBe(404);
    expect((await agent.get(`/api/customers/${customer.customerId}`)).status).toBe(404);
    expect((await agent.get('/api/customers')).body.total).toBe(0);
  });

  it('la oficina (ADMIN/SUPERADMIN) ve todos los perfiles, salvo los borrados', async () => {
    const customer = await createUser(db, { role: 'CUSTOMER' });
    const deleted = await createCustomerProfile(db);
    await db.customerProfile.update({ where: { id: deleted }, data: { deletedAt: new Date() } });
    const employee = await createUser(db, { role: 'EMPLOYEE' });
    const { agent } = await signInWithTwoFactor(ctx, 'ADMIN');

    expect((await agent.get(`/api/customers/${customer.customerId}`)).status).toBe(200);
    expect((await agent.get(`/api/employees/${employee.employeeId}`)).status).toBe(200);
    expect((await agent.get(`/api/customers/${deleted}`)).status).toBe(404);
    expect((await agent.get('/api/customers')).body.total).toBe(1);
  });

  it('un empleado desactivado pierde su alcance de empleado', async () => {
    const employee = await createUser(db, { role: 'EMPLOYEE' });
    await db.employeeProfile.update({
      where: { id: employee.employeeId as string },
      data: { isActive: false },
    });
    const agent = await signedIn(employee);
    expect((await agent.get('/api/me')).body.employeeId).toBeNull();
    expect((await agent.get(`/api/employees/${employee.employeeId}`)).status).toBe(404);
  });
});

describe('alta de clientes', () => {
  it('la oficina crea clientes sin cuenta y queda auditado', async () => {
    const { agent, user } = await signInWithTwoFactor(ctx, 'ADMIN');
    const res = await agent.post('/api/customers').send({
      firstName: 'Ana',
      lastName: 'López',
      email: 'Ana.Lopez@Example.com',
      phone: '+15551234567',
      preferredContact: 'SMS',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.customer).toMatchObject({
      userId: null,
      email: 'ana.lopez@example.com',
      marketingOptIn: false,
    });
    const entry = await db.auditLog.findFirstOrThrow({ where: { action: 'customer.create' } });
    expect(entry).toMatchObject({ actorUserId: user.id, entityId: res.body.customer.id });

    const duplicate = await agent
      .post('/api/customers')
      .send({ firstName: 'Otra', lastName: 'Ana', email: 'ana.lopez@example.com' });
    expect(duplicate.status).toBe(409);

    const badPhone = await agent
      .post('/api/customers')
      .send({ firstName: 'X', lastName: 'Y', phone: '555-1234' });
    expect(badPhone.status).toBe(400);
  });

  it('clientes y empleados no pueden crear clientes', async () => {
    for (const role of ['CUSTOMER', 'EMPLOYEE'] as const) {
      const agent = await signedIn(await createUser(db, { role }));
      const res = await agent.post('/api/customers').send({ firstName: 'X', lastName: 'Y' });
      expect(res.status).toBe(403);
    }
    expect(await db.customerProfile.count({ where: { firstName: 'X' } })).toBe(0);
  });
});

describe('invitaciones con perfil', () => {
  it('invitar a un cliente enlaza su CustomerProfile al aceptar', async () => {
    const { agent } = await signInWithTwoFactor(ctx);
    const customerId = await createCustomerProfile(db);

    const res = await agent
      .post('/api/admin/invitations')
      .send({ email: 'cliente@example.com', role: 'CUSTOMER', customerId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const accept = await newAgent(ctx.app)
      .post('/api/invitations/accept')
      .send({ token: tokenFrom('cliente@example.com'), name: 'Cliente', password: 'x'.repeat(12) });
    expect(accept.status).toBe(201);

    const profile = await db.customerProfile.findUniqueOrThrow({ where: { id: customerId } });
    expect(profile.userId).toBe(accept.body.user.id);
    // No tenía correo: queda el de la invitación.
    expect(profile.email).toBe('cliente@example.com');

    const me = await (
      await signedIn({
        id: accept.body.user.id,
        email: 'cliente@example.com',
        password: 'x'.repeat(12),
        role: 'CUSTOMER',
      })
    ).get('/api/me');
    expect(me.body.customerId).toBe(customerId);
  });

  it('una invitación de cliente exige un perfil válido y sin cuenta', async () => {
    const { agent } = await signInWithTwoFactor(ctx);
    const send = (body: Record<string, unknown>) =>
      agent.post('/api/admin/invitations').send({ role: 'CUSTOMER', ...body });

    expect((await send({ email: 'a@example.com' })).status).toBe(400);
    const unknown = await send({
      email: 'a@example.com',
      customerId: '0190f0a0-0000-7000-8000-000000000000',
    });
    expect(unknown.body.error.code).toBe('CUSTOMER_NOT_FOUND');

    const linked = await createUser(db, { role: 'CUSTOMER' });
    const hasAccount = await send({ email: 'b@example.com', customerId: linked.customerId });
    expect(hasAccount.status).toBe(409);
    expect(hasAccount.body.error.code).toBe('CUSTOMER_HAS_ACCOUNT');

    const withEmail = await createCustomerProfile(db, { email: 'registrado@example.com' });
    const mismatch = await send({ email: 'otro@example.com', customerId: withEmail });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe('EMAIL_MISMATCH');
  });

  it('invitar a un empleado crea su EmployeeProfile con los tipos de trabajo al aceptar', async () => {
    const { agent } = await signInWithTwoFactor(ctx);
    const res = await agent.post('/api/admin/invitations').send({
      email: 'tecnico@example.com',
      role: 'EMPLOYEE',
      jobTypes: ['INSPECTOR', 'CREW_LEAD'],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await db.employeeProfile.count()).toBe(0);

    const accept = await newAgent(ctx.app)
      .post('/api/invitations/accept')
      .send({ token: tokenFrom('tecnico@example.com'), name: 'Técnico', password: 'x'.repeat(12) });
    expect(accept.status).toBe(201);

    const profile = await db.employeeProfile.findUniqueOrThrow({
      where: { userId: accept.body.user.id },
    });
    expect(profile.jobTypes).toEqual(['INSPECTOR', 'CREW_LEAD']);
    const invitation = await db.invitation.findFirstOrThrow({
      where: { email: 'tecnico@example.com' },
    });
    expect(invitation.employeeId).toBe(profile.id);

    const noJobs = await agent
      .post('/api/admin/invitations')
      .send({ email: 'otro@example.com', role: 'EMPLOYEE', jobTypes: [] });
    expect(noJobs.status).toBe(400);
  });

  it('la base de datos rechaza invitaciones que no cumplen el CHECK por rol', async () => {
    const base = { tokenHash: 'h', expiresAt: new Date(Date.now() + 60_000) };
    await expect(
      db.invitation.create({ data: { ...base, email: 'c@example.com', role: 'CUSTOMER' } }),
    ).rejects.toThrow();
    await expect(
      db.invitation.create({ data: { ...base, email: 'e@example.com', role: 'EMPLOYEE' } }),
    ).rejects.toThrow();
    const customerId = await createCustomerProfile(db);
    await expect(
      db.invitation.create({
        data: { ...base, email: 'a@example.com', role: 'ADMIN', customerId },
      }),
    ).rejects.toThrow();
  });
});

describe('auditoría de solo inserción', () => {
  it('la base de datos rechaza modificar o borrar entradas', async () => {
    const entry = await db.auditLog.create({ data: { action: 'test', entityType: 'test' } });
    await expect(
      db.auditLog.update({ where: { id: entry.id }, data: { action: 'cambiado' } }),
    ).rejects.toThrow(/solo inserción/);
    await expect(db.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(/solo inserción/);
    expect((await db.auditLog.findUniqueOrThrow({ where: { id: entry.id } })).action).toBe('test');
  });
});
