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
let customerId: string;
let propertyId: string;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
  admin = (await signInWithTwoFactor(ctx, 'ADMIN')).agent;
  employee = await createUser(db, { role: 'EMPLOYEE' });
  employeeAgent = await loginAs(ctx, employee);
  customerId = await createCustomerProfile(db);
  propertyId = await createProperty(db, customerId);
});

afterAll(async () => {
  await db.$disconnect();
});

let slot = 0;
async function appointment(
  overrides: { assigneeId?: string; type?: 'INSPECTION' | 'FOLLOW_UP'; leadId?: string } = {},
): Promise<string> {
  slot += 1;
  const start = new Date(Date.UTC(2030, 0, 2, 9) + slot * 86_400_000);
  const row = await db.appointment.create({
    data: {
      customerId,
      propertyId,
      assigneeId: overrides.assigneeId ?? (employee.employeeId as string),
      type: overrides.type ?? 'INSPECTION',
      startsAt: start,
      endsAt: new Date(start.getTime() + 3_600_000),
      ...(overrides.leadId ? { leadId: overrides.leadId } : {}),
    },
  });
  return row.id;
}

const section = (overrides: Record<string, unknown> = {}) => ({
  name: 'Faldón sur',
  areaSqft: 820.5,
  pitchRise: 6,
  ridgeFt: 30,
  eaveFt: 45.5,
  ...overrides,
});

describe('inspecciones: alta y permisos', () => {
  it('la oficina crea una inspección para una cita y no se repite', async () => {
    const appointmentId = await appointment();
    const res = await admin
      .post('/api/inspections')
      .send({ appointmentId, roofType: 'METAL', roofAgeYears: 12 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.inspection).toMatchObject({
      status: 'DRAFT',
      roofType: 'METAL',
      inspectorId: employee.employeeId,
      propertyId,
      sections: [],
    });
    const again = await admin.post('/api/inspections').send({ appointmentId });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INSPECTION_EXISTS');
    expect(await db.auditLog.count({ where: { action: 'inspection.create' } })).toBe(1);
  });

  it('el empleado asignado la crea; otro empleado, un cliente o una cita ajena no', async () => {
    const mine = await appointment();
    const res = await employeeAgent.post('/api/inspections').send({ appointmentId: mine });
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const other = await createUser(db, { role: 'EMPLOYEE' });
    const others = await appointment({ assigneeId: other.employeeId as string });
    expect(
      (await employeeAgent.post('/api/inspections').send({ appointmentId: others })).status,
    ).toBe(404);

    const customer = await createUser(db, { role: 'CUSTOMER' });
    const customerAgent = await loginAs(ctx, customer);
    expect(
      (await customerAgent.post('/api/inspections').send({ appointmentId: mine })).status,
    ).toBe(403);
    expect((await customerAgent.get('/api/inspections')).body.total).toBe(0);
    expect((await customerAgent.get(`/api/inspections/${res.body.inspection.id}`)).status).toBe(
      404,
    );
    expect((await request(ctx.app).get('/api/inspections')).status).toBe(401);
  });

  it('rechaza citas que no son de inspección, canceladas o inexistentes', async () => {
    const followUp = await appointment({ type: 'FOLLOW_UP' });
    expect((await admin.post('/api/inspections').send({ appointmentId: followUp })).status).toBe(
      409,
    );
    const canceled = await appointment();
    await db.appointment.update({
      where: { id: canceled },
      data: { status: 'CANCELED', cancelReason: 'x' },
    });
    expect((await admin.post('/api/inspections').send({ appointmentId: canceled })).status).toBe(
      409,
    );
    expect(
      (await admin.post('/api/inspections').send({ appointmentId: crypto.randomUUID() })).status,
    ).toBe(404);
  });

  it('el empleado solo lista y ve sus inspecciones', async () => {
    const other = await createUser(db, { role: 'EMPLOYEE' });
    const mine = await admin.post('/api/inspections').send({ appointmentId: await appointment() });
    await db.appointment.updateMany({ data: { status: 'COMPLETED' } });
    const theirs = await db.appointment.create({
      data: {
        customerId,
        propertyId,
        assigneeId: other.employeeId as string,
        type: 'INSPECTION',
        startsAt: new Date(Date.UTC(2030, 0, 3, 9)),
        endsAt: new Date(Date.UTC(2030, 0, 3, 10)),
      },
    });
    const foreign = await admin.post('/api/inspections').send({ appointmentId: theirs.id });
    const list = await employeeAgent.get('/api/inspections');
    expect(list.body.inspections.map((i: { id: string }) => i.id)).toEqual([
      mine.body.inspection.id,
    ]);
    expect((await employeeAgent.get(`/api/inspections/${foreign.body.inspection.id}`)).status).toBe(
      404,
    );
    expect((await admin.get('/api/inspections')).body.total).toBe(2);
    expect((await admin.get('/api/inspections?status=COMPLETED')).body.total).toBe(0);
  });
});

describe('inspecciones: secciones', () => {
  async function draft(agent: Agent = admin) {
    const created = await agent
      .post('/api/inspections')
      .send({ appointmentId: await appointment() });
    return created.body.inspection.id as string;
  }

  it('CRUD de secciones con números y auditoría', async () => {
    const id = await draft();
    const created = await admin.post(`/api/inspections/${id}/sections`).send(section());
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.section).toMatchObject({
      areaSqft: 820.5,
      pitchRise: 6,
      hipFt: 0,
      eaveFt: 45.5,
    });
    const sectionId = created.body.section.id as string;

    const patched = await admin
      .patch(`/api/inspections/${id}/sections/${sectionId}`)
      .send({ name: 'Faldón norte', notes: null, pitchRise: 7.5 });
    expect(patched.body.section).toMatchObject({ name: 'Faldón norte', pitchRise: 7.5 });

    const detail = await admin.get(`/api/inspections/${id}`);
    expect(detail.body.inspection.sections).toHaveLength(1);

    expect((await admin.delete(`/api/inspections/${id}/sections/${sectionId}`)).status).toBe(204);
    expect((await admin.delete(`/api/inspections/${id}/sections/${sectionId}`)).status).toBe(404);
    expect(
      await db.auditLog.count({ where: { action: { startsWith: 'inspection.section' } } }),
    ).toBe(3);
  });

  it('valida como los CHECK de la base', async () => {
    const id = await draft();
    for (const bad of [
      { name: '  ' },
      { areaSqft: 0 },
      { areaSqft: -5 },
      { pitchRise: 25 },
      { pitchRise: 6.25 },
      { ridgeFt: -1 },
      { name: 'x'.repeat(101) },
      { unknown: 1 },
    ]) {
      const res = await admin.post(`/api/inspections/${id}/sections`).send(section(bad));
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });

  it('el empleado asignado edita su borrador; uno ajeno recibe 404', async () => {
    const id = await draft(employeeAgent);
    expect(
      (await employeeAgent.post(`/api/inspections/${id}/sections`).send(section())).status,
    ).toBe(201);
    expect(
      (await employeeAgent.patch(`/api/inspections/${id}`).send({ findings: 'Tejas levantadas' }))
        .status,
    ).toBe(200);
    const other = await createUser(db, { role: 'EMPLOYEE' });
    const otherAgent = await loginAs(ctx, other);
    expect((await otherAgent.post(`/api/inspections/${id}/sections`).send(section())).status).toBe(
      404,
    );
    expect((await otherAgent.post(`/api/inspections/${id}/complete`).send({})).status).toBe(404);
  });

  it('completar: DRAFT a COMPLETED con fecha; después nada se edita', async () => {
    const id = await draft();
    const sectionId = (await admin.post(`/api/inspections/${id}/sections`).send(section())).body
      .section.id;
    const done = await admin.post(`/api/inspections/${id}/complete`).send({});
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.inspection.status).toBe('COMPLETED');
    expect(done.body.inspection.completedAt).toBeTruthy();
    for (const attempt of [
      admin.post(`/api/inspections/${id}/complete`).send({}),
      admin.patch(`/api/inspections/${id}`).send({ findings: 'x' }),
      admin.post(`/api/inspections/${id}/sections`).send(section()),
      admin.patch(`/api/inspections/${id}/sections/${sectionId}`).send({ name: 'Otro' }),
      admin.delete(`/api/inspections/${id}/sections/${sectionId}`),
    ]) {
      const res = await attempt;
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSPECTION_COMPLETED');
    }
  });

  it('completar lleva el lead de APPOINTMENT_SET a INSPECTED si la RLS lo permite', async () => {
    const lead = await db.lead.create({
      data: {
        source: 'PHONE',
        firstName: 'Lead',
        phone: '+13055550166',
        status: 'APPOINTMENT_SET',
        customerId,
        propertyId,
      },
    });
    const appointmentId = await appointment({ leadId: lead.id });
    const created = await admin.post('/api/inspections').send({ appointmentId });
    expect(
      (await admin.post(`/api/inspections/${created.body.inspection.id}/complete`).send({})).status,
    ).toBe(200);
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe('INSPECTED');
  });

  it('un empleado sin el lead asignado completa sin error y el lead no cambia', async () => {
    const lead = await db.lead.create({
      data: {
        source: 'PHONE',
        firstName: 'Lead',
        phone: '+13055550167',
        status: 'APPOINTMENT_SET',
        customerId,
        propertyId,
      },
    });
    const appointmentId = await appointment({ leadId: lead.id });
    const created = await employeeAgent.post('/api/inspections').send({ appointmentId });
    expect(created.status).toBe(201);
    const done = await employeeAgent
      .post(`/api/inspections/${created.body.inspection.id}/complete`)
      .send({});
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe(
      'APPOINTMENT_SET',
    );
  });
});
