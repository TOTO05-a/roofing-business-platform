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
  type TestContext,
} from './helpers.js';

const db = createTestDb();
let ctx: TestContext;
let admin: Agent;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
  admin = (await signInWithTwoFactor(ctx, 'ADMIN')).agent;
});

afterAll(async () => {
  await db.$disconnect();
});

const validBody = (customerId: string) => ({
  customerId,
  addressLine1: '1200 Brickell Ave',
  city: 'Miami',
  state: 'fl',
  zip: '33131',
  yearBuilt: 1998,
  lat: 25.7617,
  lng: -80.1918,
});

describe('propiedades', () => {
  it('la oficina crea, lista, edita y borra lógicamente; todo queda auditado', async () => {
    const customerId = await createCustomerProfile(db);
    const created = await admin.post('/api/properties').send(validBody(customerId));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.property).toMatchObject({ state: 'FL', lat: 25.7617, yearBuilt: 1998 });
    const id = created.body.property.id as string;

    const list = await admin.get(`/api/properties?customerId=${customerId}&q=brickell`);
    expect(list.body.total).toBe(1);

    const patched = await admin.patch(`/api/properties/${id}`).send({ city: 'Doral', notes: null });
    expect(patched.status).toBe(200);
    expect(patched.body.property.city).toBe('Doral');

    expect((await admin.delete(`/api/properties/${id}`)).status).toBe(204);
    expect((await admin.get(`/api/properties/${id}`)).status).toBe(404);
    expect((await admin.get('/api/properties')).body.total).toBe(0);
    // El borrado es lógico: la fila sigue en la base.
    expect(await db.property.count({ where: { id } })).toBe(1);

    const actions = (await db.auditLog.findMany({ where: { entityId: id } })).map((a) => a.action);
    expect(actions.sort()).toEqual(['property.create', 'property.delete', 'property.update']);
  });

  it('valida estado, ZIP y campos desconocidos como los CHECK de la base', async () => {
    const customerId = await createCustomerProfile(db);
    for (const bad of [
      { state: 'ZZ' },
      { zip: '1234' },
      { addressLine1: '   ' },
      { yearBuilt: 1700 },
      { lat: 120 },
      { extra: 'x' },
    ]) {
      const res = await admin.post('/api/properties').send({ ...validBody(customerId), ...bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await admin.patch('/api/properties/' + crypto.randomUUID()).send({})).status).toBe(400);
  });

  it('cliente inexistente o propiedad inexistente: 404', async () => {
    const missing = crypto.randomUUID();
    expect((await admin.post('/api/properties').send(validBody(missing))).status).toBe(404);
    expect((await admin.patch(`/api/properties/${missing}`).send({ city: 'X' })).status).toBe(404);
    expect((await admin.delete(`/api/properties/${missing}`)).status).toBe(404);
  });

  it('el cliente solo ve las suyas (404 con las ajenas) y no puede escribir', async () => {
    const alice = await createUser(db, { role: 'CUSTOMER' });
    const bob = await createUser(db, { role: 'CUSTOMER' });
    const aliceProperty = await createProperty(db, alice.customerId as string);
    const bobProperty = await createProperty(db, bob.customerId as string);
    const agent = await loginAs(ctx, alice);

    await db.property.update({ where: { id: aliceProperty }, data: { notes: 'Nota interna' } });
    const own = await agent.get(`/api/properties/${aliceProperty}`);
    expect(own.status).toBe(200);
    expect(own.body.property).not.toHaveProperty('notes'); // notas internas (modelo §4.4)
    expect((await agent.get('/api/properties')).body.properties[0]).not.toHaveProperty('notes');
    expect((await agent.get(`/api/properties/${bobProperty}`)).status).toBe(404);
    expect((await agent.get('/api/properties')).body.total).toBe(1);

    const create = await agent.post('/api/properties').send(validBody(alice.customerId as string));
    expect(create.status).toBe(403);
    expect((await agent.patch(`/api/properties/${aliceProperty}`).send({ city: 'X' })).status).toBe(
      403,
    );
    expect((await agent.delete(`/api/properties/${aliceProperty}`)).status).toBe(403);
  });

  it('el empleado ve solo las propiedades de sus citas o leads, y no escribe', async () => {
    const employee = await createUser(db, { role: 'EMPLOYEE' });
    const customerId = await createCustomerProfile(db);
    const withAppointment = await createProperty(db, customerId);
    const withLead = await createProperty(db, customerId);
    const unrelated = await createProperty(db, customerId);
    const start = new Date(Date.now() + 86_400_000);
    await db.appointment.create({
      data: {
        propertyId: withAppointment,
        customerId,
        assigneeId: employee.employeeId as string,
        type: 'INSPECTION',
        startsAt: start,
        endsAt: new Date(start.getTime() + 3_600_000),
      },
    });
    await db.lead.create({
      data: {
        source: 'PHONE',
        firstName: 'Ana',
        phone: '+13055550101',
        customerId,
        propertyId: withLead,
        assignedToId: employee.employeeId as string,
      },
    });
    const agent = await loginAs(ctx, employee);
    const list = await agent.get('/api/properties');
    expect(list.body.properties.map((p: { id: string }) => p.id).sort()).toEqual(
      [withAppointment, withLead].sort(),
    );
    expect((await agent.get(`/api/properties/${unrelated}`)).status).toBe(404);
    expect((await agent.patch(`/api/properties/${withLead}`).send({ city: 'X' })).status).toBe(403);
  });

  it('exige sesión', async () => {
    expect((await request(ctx.app).get('/api/properties')).status).toBe(401);
  });
});
