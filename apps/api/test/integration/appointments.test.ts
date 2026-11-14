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

const HOUR = 3_600_000;
/** Hora de inicio en el futuro, `hours` horas desde mañana a las 00:00 UTC. */
const at = (hours: number) => new Date(Date.UTC(2030, 0, 2) + hours * HOUR).toISOString();

const body = (startHour: number, endHour: number, overrides: Record<string, unknown> = {}) => ({
  customerId,
  propertyId,
  assigneeId: employee.employeeId,
  type: 'INSPECTION',
  startsAt: at(startHour),
  endsAt: at(endHour),
  ...overrides,
});

async function create(startHour: number, endHour: number, overrides = {}) {
  const res = await admin.post('/api/appointments').send(body(startHour, endHour, overrides));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.appointment.id as string;
}

describe('citas: alta y solape', () => {
  it('la oficina crea una cita y queda auditada', async () => {
    const id = await create(9, 10, { notes: 'Llevar escalera' });
    const audit = await db.auditLog.findFirst({ where: { action: 'appointment.create' } });
    expect(audit?.entityId).toBe(id);
  });

  it('valida el rango, tipos y que la propiedad sea del cliente', async () => {
    for (const bad of [
      body(10, 9),
      body(9, 22),
      body(9, 10, { type: 'OTRO' }),
      body(9, 10, { startsAt: 'mañana' }),
      body(9, 10, { extra: 1 }),
    ]) {
      expect((await admin.post('/api/appointments').send(bad)).status).toBe(400);
    }
    const stranger = await createCustomerProfile(db);
    const res = await admin.post('/api/appointments').send(body(9, 10, { customerId: stranger }));
    expect(res.status).toBe(404);
    const noEmployee = await admin
      .post('/api/appointments')
      .send(body(9, 10, { assigneeId: crypto.randomUUID() }));
    expect(noEmployee.status).toBe(404);
  });

  it('solape: 409 bilingüe con el id de la cita en conflicto; contiguas no se solapan', async () => {
    const first = await create(9, 11);
    const clash = await admin.post('/api/appointments').send(body(10, 12));
    expect(clash.status).toBe(409);
    expect(clash.body.error).toMatchObject({
      code: 'APPOINTMENT_OVERLAP',
      conflictingAppointmentId: first,
    });
    expect(clash.body.error.message).toContain('ya tiene una cita');
    expect(clash.body.error.messages.es).toBe(clash.body.error.message);
    expect(clash.body.error.messages.en).toContain('already has an appointment');
    // Rango semiabierto: empezar justo cuando termina la otra es válido.
    await create(11, 12);
    // Otro empleado sí puede tener la misma hora.
    const other = await createUser(db, { role: 'EMPLOYEE' });
    await create(9, 11, { assigneeId: other.employeeId });
  });

  it('una cita cancelada libera el horario', async () => {
    const id = await create(9, 11);
    expect(
      (
        await admin
          .post(`/api/appointments/${id}/status`)
          .send({ status: 'CANCELED', cancelReason: 'Lluvia' })
      ).status,
    ).toBe(200);
    await create(9, 11);
  });

  it('carrera: dos peticiones simultáneas al mismo hueco, una 201 y otra 409', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => admin.post('/api/appointments').send(body(14, 15))),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses, JSON.stringify(results.map((r) => r.body))).toEqual([201, 409, 409, 409]);
    for (const r of results.filter((x) => x.status === 409)) {
      expect(r.body.error.code).toBe('APPOINTMENT_OVERLAP');
      expect(r.body.error.messages.en).toBeTruthy();
    }
    expect(await db.appointment.count()).toBe(1);
  });
});

describe('citas: lectura y permisos', () => {
  it('cada rol ve lo suyo; el cliente no ve las notas internas', async () => {
    const mine = await create(9, 10, { notes: 'interna' });
    const otherEmployee = await createUser(db, { role: 'EMPLOYEE' });
    const others = await create(9, 10, { assigneeId: otherEmployee.employeeId });

    const own = await employeeAgent.get('/api/appointments');
    expect(own.body.appointments.map((a: { id: string }) => a.id)).toEqual([mine]);
    expect((await employeeAgent.get(`/api/appointments/${others}`)).status).toBe(404);

    const owner = await createUser(db, { role: 'CUSTOMER' });
    const ownerProperty = await createProperty(db, owner.customerId as string);
    const visible = await admin
      .post('/api/appointments')
      .send(
        body(15, 16, { customerId: owner.customerId, propertyId: ownerProperty, notes: 'secreto' }),
      );
    const customerAgent = await loginAs(ctx, owner);
    const list = await customerAgent.get('/api/appointments');
    expect(list.body.total).toBe(1);
    expect(list.body.appointments[0].id).toBe(visible.body.appointment.id);
    expect(list.body.appointments[0]).not.toHaveProperty('notes');
    expect((await customerAgent.get(`/api/appointments/${mine}`)).status).toBe(404);
    expect((await customerAgent.post('/api/appointments').send(body(9, 10))).status).toBe(403);

    expect((await admin.get('/api/appointments')).body.total).toBe(3);
    expect(
      (await admin.get(`/api/appointments?assigneeId=${otherEmployee.employeeId}`)).body.total,
    ).toBe(1);
    expect((await request(ctx.app).get('/api/appointments')).status).toBe(401);
    expect((await employeeAgent.post('/api/appointments').send(body(20, 21))).status).toBe(403);
  });

  it('cambiar el empleado respeta el solape', async () => {
    const other = await createUser(db, { role: 'EMPLOYEE' });
    await create(9, 10, { assigneeId: other.employeeId });
    const mine = await create(9, 10);
    const res = await admin
      .patch(`/api/appointments/${mine}`)
      .send({ assigneeId: other.employeeId });
    expect(res.status).toBe(409);
    const notes = await admin.patch(`/api/appointments/${mine}`).send({ notes: 'ok' });
    expect(notes.status).toBe(200);
  });
});

describe('citas: estados', () => {
  it('el empleado asignado avanza la visita; confirmar y cancelar son de la oficina', async () => {
    const id = await create(9, 10);
    const status = (agent: Agent, to: string, extra: object = {}) =>
      agent.post(`/api/appointments/${id}/status`).send({ status: to, ...extra });
    expect((await status(employeeAgent, 'CONFIRMED')).status).toBe(403);
    expect((await status(admin, 'CONFIRMED')).status).toBe(200);
    expect((await status(employeeAgent, 'CANCELED', { cancelReason: 'x' })).status).toBe(403);
    expect((await status(employeeAgent, 'IN_PROGRESS')).status).toBe(200);
    expect((await status(employeeAgent, 'COMPLETED')).status).toBe(200);
    const closed = await status(admin, 'CANCELED', { cancelReason: 'tarde' });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('INVALID_TRANSITION');
    expect(await db.auditLog.count({ where: { action: 'appointment.status', entityId: id } })).toBe(
      3,
    );
  });

  it('cancelar exige motivo; RESCHEDULED solo por /reschedule; NO_SHOW desde CONFIRMED', async () => {
    const id = await create(9, 10);
    expect(
      (await admin.post(`/api/appointments/${id}/status`).send({ status: 'CANCELED' })).status,
    ).toBe(400);
    expect(
      (await admin.post(`/api/appointments/${id}/status`).send({ status: 'RESCHEDULED' })).status,
    ).toBe(400);
    expect(
      (await admin.post(`/api/appointments/${id}/status`).send({ status: 'NO_SHOW' })).status,
    ).toBe(409);
    await admin.post(`/api/appointments/${id}/status`).send({ status: 'CONFIRMED' });
    expect(
      (await employeeAgent.post(`/api/appointments/${id}/status`).send({ status: 'NO_SHOW' }))
        .status,
    ).toBe(200);
    const canceled = await create(12, 13);
    const res = await admin
      .post(`/api/appointments/${canceled}/status`)
      .send({ status: 'CANCELED', cancelReason: 'El cliente canceló' });
    expect(res.body.appointment.cancelReason).toBe('El cliente canceló');
  });

  it('reprogramar crea una cita nueva enlazada y deja la vieja en RESCHEDULED', async () => {
    const id = await create(9, 11);
    // Puede moverse a un horario que pisa el suyo propio.
    const res = await admin
      .post(`/api/appointments/${id}/reschedule`)
      .send({ startsAt: at(10), endsAt: at(12) });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.appointment).toMatchObject({ rescheduledFromId: id, status: 'SCHEDULED' });
    expect(res.body.previous.status).toBe('RESCHEDULED');
    // Una cita ya reprogramada no se reprograma otra vez.
    const again = await admin
      .post(`/api/appointments/${id}/reschedule`)
      .send({ startsAt: at(20), endsAt: at(21) });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('reprogramar con solape deshace todo: la cita vieja sigue activa', async () => {
    const id = await create(9, 10);
    await create(13, 14);
    const res = await admin
      .post(`/api/appointments/${id}/reschedule`)
      .send({ startsAt: at(13), endsAt: at(15) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPOINTMENT_OVERLAP');
    const old = await db.appointment.findUniqueOrThrow({ where: { id } });
    expect(old.status).toBe('SCHEDULED');
    expect(await db.appointment.count()).toBe(2);
    expect(
      (
        await employeeAgent
          .post(`/api/appointments/${id}/reschedule`)
          .send({ startsAt: at(20), endsAt: at(21) })
      ).status,
    ).toBe(403);
  });
});

describe('citas ligadas a un lead', () => {
  async function lead(status: 'NEW' | 'CONTACTED', converted = true) {
    return db.lead.create({
      data: {
        source: 'PHONE',
        firstName: 'Lead',
        phone: '+13055550177',
        status,
        ...(converted ? { customerId, propertyId } : {}),
      },
    });
  }

  it('exige conversión previa y lleva el lead a APPOINTMENT_SET', async () => {
    const unconverted = await lead('CONTACTED', false);
    const refused = await admin
      .post('/api/appointments')
      .send(body(9, 10, { leadId: unconverted.id }));
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('LEAD_NOT_CONVERTED');

    const fresh = await lead('NEW');
    const ok = await admin.post('/api/appointments').send(body(9, 10, { leadId: fresh.id }));
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect((await db.lead.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe(
      'APPOINTMENT_SET',
    );
    expect(await db.auditLog.count({ where: { action: 'lead.status', entityId: fresh.id } })).toBe(
      2,
    );
  });

  it('un lead de otro cliente o cerrado no admite cita; una cita fallida no mueve el lead', async () => {
    const other = await createCustomerProfile(db);
    const otherProperty = await createProperty(db, other);
    const mismatch = await db.lead.create({
      data: {
        source: 'PHONE',
        firstName: 'X',
        phone: '+13055550178',
        status: 'CONTACTED',
        customerId: other,
        propertyId: otherProperty,
      },
    });
    expect(
      (await admin.post('/api/appointments').send(body(9, 10, { leadId: mismatch.id }))).status,
    ).toBe(409);
    const contacted = await lead('CONTACTED');
    await create(9, 10);
    const clash = await admin.post('/api/appointments').send(body(9, 10, { leadId: contacted.id }));
    expect(clash.status).toBe(409);
    expect((await db.lead.findUniqueOrThrow({ where: { id: contacted.id } })).status).toBe(
      'CONTACTED',
    );
  });
});
