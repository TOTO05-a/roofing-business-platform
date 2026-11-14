import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createCustomerProfile,
  createProperty,
  createTestContext,
  createTestDb,
  createUser,
  loginAs,
  resetDatabase,
  signInWithTwoFactor,
  type Agent,
  type CreatedUser,
  type TestContext,
} from './helpers.js';

const db = createTestDb();
let ctx: TestContext;
let admin: Agent;
let employee: CreatedUser;
let employeeAgent: Agent;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
  admin = (await signInWithTwoFactor(ctx, 'ADMIN')).agent;
  employee = await createUser(db, { role: 'EMPLOYEE' });
  employeeAgent = await loginAs(ctx, employee);
});

afterAll(async () => {
  await db.$disconnect();
});

const leadBody = (overrides: Record<string, unknown> = {}) => ({
  source: 'PHONE',
  firstName: 'Marta',
  lastName: 'Ruiz',
  phone: '(305) 555-0142',
  email: 'Marta.Ruiz@Example.com',
  addressLine1: '45 Calle Falsa',
  city: 'Doral',
  state: 'fl',
  zip: '33166',
  ...overrides,
});

async function newLead(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await admin.post('/api/leads').send(leadBody(overrides));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.lead.id as string;
}

describe('leads: alta, lectura y edición', () => {
  it('la oficina crea un lead normalizando teléfono, correo y estado', async () => {
    const res = await admin.post('/api/leads').send(leadBody());
    expect(res.status).toBe(201);
    expect(res.body.lead).toMatchObject({
      status: 'NEW',
      phone: '+13055550142',
      email: 'marta.ruiz@example.com',
      state: 'FL',
    });
    const audit = await db.auditLog.findFirst({ where: { action: 'lead.create' } });
    expect(audit?.entityId).toBe(res.body.lead.id);
  });

  it('rechaza fuente WEB_FORM, falta de contacto y campos desconocidos', async () => {
    for (const bad of [
      { source: 'WEB_FORM' },
      { email: undefined, phone: undefined },
      { phone: '123' },
      { status: 'WON' },
    ]) {
      const res = await admin.post('/api/leads').send(leadBody(bad));
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });

  it('lista con filtros y paginación; el empleado solo ve los suyos', async () => {
    const mine = await newLead({ firstName: 'Uno' });
    await newLead({ firstName: 'Dos', email: 'dos@example.com', phone: '3055550111' });
    await newLead({ firstName: 'Tres', email: 'tres@example.com', phone: '3055550112' });
    expect(
      (await admin.post(`/api/leads/${mine}/assign`).send({ employeeId: employee.employeeId }))
        .status,
    ).toBe(200);

    const all = await admin.get('/api/leads?pageSize=2&page=1');
    expect(all.body).toMatchObject({ total: 3, pageSize: 2 });
    expect(all.body.leads).toHaveLength(2);
    expect((await admin.get('/api/leads?q=dos')).body.total).toBe(1);
    expect((await admin.get(`/api/leads?assignedToId=${employee.employeeId}`)).body.total).toBe(1);
    expect((await admin.get('/api/leads?status=WON')).body.total).toBe(0);

    const own = await employeeAgent.get('/api/leads');
    expect(own.body.total).toBe(1);
    expect(own.body.leads[0].id).toBe(mine);
  });

  it('un lead ajeno es 404 para el empleado; clientes sin acceso; sin sesión 401', async () => {
    const other = await newLead();
    expect((await employeeAgent.get(`/api/leads/${other}`)).status).toBe(404);
    expect((await employeeAgent.patch(`/api/leads/${other}`).send({ firstName: 'X' })).status).toBe(
      403,
    );
    expect((await employeeAgent.post('/api/leads').send(leadBody())).status).toBe(403);

    const customer = await createUser(db, { role: 'CUSTOMER' });
    const customerAgent = await loginAs(ctx, customer);
    expect((await customerAgent.get('/api/leads')).body.total).toBe(0);
    expect((await customerAgent.get(`/api/leads/${other}`)).status).toBe(404);
    expect((await request(ctx.app).get('/api/leads')).status).toBe(401);
  });

  it('edita datos de contacto pero no deja al lead sin correo ni teléfono', async () => {
    const id = await newLead();
    const ok = await admin.patch(`/api/leads/${id}`).send({ city: 'Hialeah', email: null });
    expect(ok.status).toBe(200);
    expect(ok.body.lead).toMatchObject({ city: 'Hialeah', email: null });
    const bad = await admin.patch(`/api/leads/${id}`).send({ phone: null });
    expect(bad.status).toBe(400);
  });
});

describe('leads: asignación', () => {
  it('asigna y desasigna; empleado inexistente es 404; el empleado no reasigna', async () => {
    const id = await newLead();
    const assigned = await admin
      .post(`/api/leads/${id}/assign`)
      .send({ employeeId: employee.employeeId });
    expect(assigned.body.lead.assignedToId).toBe(employee.employeeId);
    expect(
      (await employeeAgent.post(`/api/leads/${id}/assign`).send({ employeeId: null })).status,
    ).toBe(403);
    expect(
      (await admin.post(`/api/leads/${id}/assign`).send({ employeeId: crypto.randomUUID() }))
        .status,
    ).toBe(404);
    const cleared = await admin.post(`/api/leads/${id}/assign`).send({ employeeId: null });
    expect(cleared.body.lead.assignedToId).toBeNull();
    expect(await db.auditLog.count({ where: { action: 'lead.assign', entityId: id } })).toBe(2);
  });
});

describe('leads: estados', () => {
  it('recorre el camino feliz con conversión previa y audita cada cambio', async () => {
    const id = await newLead();
    const status = (to: string, extra: object = {}) =>
      admin.post(`/api/leads/${id}/status`).send({ status: to, ...extra });
    expect((await status('CONTACTED')).status).toBe(200);
    // Sin convertir no puede pasar a APPOINTMENT_SET (CHECK de la base y máquina de estados).
    const notConverted = await status('APPOINTMENT_SET');
    expect(notConverted.status).toBe(409);
    expect(notConverted.body.error.code).toBe('LEAD_NOT_CONVERTED');
    expect((await admin.post(`/api/leads/${id}/convert`).send({})).status).toBe(200);
    for (const to of ['APPOINTMENT_SET', 'INSPECTED', 'QUOTED', 'WON']) {
      expect((await status(to)).status, to).toBe(200);
    }
    expect(await db.auditLog.count({ where: { action: 'lead.status', entityId: id } })).toBe(5);
    // WON es terminal.
    const after = await status('CONTACTED');
    expect(after.status).toBe(409);
    expect(after.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('transición inválida: 409 INVALID_TRANSITION con los estados permitidos', async () => {
    const id = await newLead();
    const res = await admin.post(`/api/leads/${id}/status`).send({ status: 'WON' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_TRANSITION',
      from: 'NEW',
      to: 'WON',
    });
    expect(res.body.error.allowed).toContain('CONTACTED');
  });

  it('LOST exige motivo, y solo la oficina reabre (LOST a CONTACTED)', async () => {
    const id = await newLead();
    await db.lead.update({ where: { id }, data: { assignedToId: employee.employeeId as string } });
    const noReason = await employeeAgent.post(`/api/leads/${id}/status`).send({ status: 'LOST' });
    expect(noReason.status).toBe(400);
    const lost = await employeeAgent
      .post(`/api/leads/${id}/status`)
      .send({ status: 'LOST', lostReason: 'Eligió a otra empresa' });
    expect(lost.status, JSON.stringify(lost.body)).toBe(200);
    expect(lost.body.lead.lostReason).toBe('Eligió a otra empresa');
    const reopenByEmployee = await employeeAgent
      .post(`/api/leads/${id}/status`)
      .send({ status: 'CONTACTED' });
    expect(reopenByEmployee.status).toBe(403);
    const reopen = await admin.post(`/api/leads/${id}/status`).send({ status: 'CONTACTED' });
    expect(reopen.status).toBe(200);
    expect(reopen.body.lead).toMatchObject({ status: 'CONTACTED', lostReason: null });
  });

  it('el empleado asignado cambia el estado de sus leads, no el de otros; spam es de oficina', async () => {
    const mine = await newLead();
    const other = await newLead({ email: 'otro@example.com', phone: '3055550199' });
    await db.lead.update({
      where: { id: mine },
      data: { assignedToId: employee.employeeId as string },
    });
    expect(
      (await employeeAgent.post(`/api/leads/${mine}/status`).send({ status: 'CONTACTED' })).status,
    ).toBe(200);
    expect(
      (await employeeAgent.post(`/api/leads/${other}/status`).send({ status: 'CONTACTED' })).status,
    ).toBe(404);
    expect(
      (await employeeAgent.post(`/api/leads/${mine}/status`).send({ status: 'NEW' })).status,
    ).toBe(409);
    await db.lead.update({ where: { id: mine }, data: { status: 'NEW' } });
    expect(
      (await employeeAgent.post(`/api/leads/${mine}/status`).send({ status: 'SPAM' })).status,
    ).toBe(403);
    // La asignación sigue siendo suya tras cambiar el estado.
    const row = await db.lead.findUniqueOrThrow({ where: { id: mine } });
    expect(row.assignedToId).toBe(employee.employeeId);
  });
});

describe('leads: conversión', () => {
  it('crea cliente y propiedad desde el lead en una transacción', async () => {
    const id = await newLead();
    const res = await admin.post(`/api/leads/${id}/convert`).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ customerCreated: true, propertyCreated: true });
    const customer = await db.customerProfile.findUniqueOrThrow({
      where: { id: res.body.customerId },
    });
    expect(customer).toMatchObject({ firstName: 'Marta', lastName: 'Ruiz', phone: '+13055550142' });
    const property = await db.property.findUniqueOrThrow({ where: { id: res.body.propertyId } });
    expect(property).toMatchObject({
      customerId: customer.id,
      city: 'Doral',
      state: 'FL',
      zip: '33166',
    });
    expect(res.body.lead).toMatchObject({ customerId: customer.id, propertyId: property.id });
    expect((await admin.post(`/api/leads/${id}/convert`).send({})).status).toBe(409);
    expect(await db.auditLog.count({ where: { action: 'lead.convert', entityId: id } })).toBe(1);
  });

  it('enlaza el cliente existente (mismo correo) y reutiliza su propiedad igual', async () => {
    const customerId = await createCustomerProfile(db, { email: 'marta.ruiz@example.com' });
    const propertyId = await createProperty(db, customerId, {
      addressLine1: '45 CALLE FALSA',
      zip: '33166',
    });
    const id = await newLead();
    const res = await admin.post(`/api/leads/${id}/convert`).send({});
    expect(res.body).toMatchObject({
      customerId,
      propertyId,
      customerCreated: false,
      propertyCreated: false,
    });
    expect(await db.customerProfile.count()).toBe(1);
    expect(await db.property.count()).toBe(1);
  });

  it('dirección incompleta, sin apellido o propiedad de otro cliente; empleado no convierte', async () => {
    const noAddress = await newLead({
      addressLine1: undefined,
      city: undefined,
      state: undefined,
      zip: undefined,
    });
    const incomplete = await admin.post(`/api/leads/${noAddress}/convert`).send({});
    expect(incomplete.status).toBe(400);
    expect(await db.customerProfile.count()).toBe(0); // la transacción se deshizo

    const noLast = await newLead({
      lastName: undefined,
      email: 'sin@example.com',
      phone: '3055550150',
    });
    const missingLast = await admin.post(`/api/leads/${noLast}/convert`).send({});
    expect(missingLast.status).toBe(400);
    expect(
      (await admin.post(`/api/leads/${noLast}/convert`).send({ lastName: 'Gómez' })).status,
    ).toBe(200);

    const stranger = await createCustomerProfile(db);
    const strangerProperty = await createProperty(db, stranger);
    const other = await newLead({ email: 'x@example.com', phone: '3055550151' });
    const cross = await admin
      .post(`/api/leads/${other}/convert`)
      .send({ customerId: stranger, propertyId: crypto.randomUUID() });
    expect(cross.status).toBe(404);
    const ok = await admin
      .post(`/api/leads/${other}/convert`)
      .send({ customerId: stranger, propertyId: strangerProperty });
    expect(ok.status).toBe(200);

    const mine = await newLead({ email: 'y@example.com', phone: '3055550152' });
    await db.lead.update({
      where: { id: mine },
      data: { assignedToId: employee.employeeId as string },
    });
    expect((await employeeAgent.post(`/api/leads/${mine}/convert`).send({})).status).toBe(403);
  });

  it('no convierte leads cerrados', async () => {
    const id = await newLead();
    await admin.post(`/api/leads/${id}/status`).send({ status: 'LOST', lostReason: 'Sin interés' });
    const res = await admin.post(`/api/leads/${id}/convert`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LEAD_CLOSED');
  });
});
