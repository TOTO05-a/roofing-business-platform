import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeStorage } from './fake-storage.js';
import {
  APP_ORIGIN,
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
let storage: FakeStorage;
let admin: Agent;
let employee: CreatedUser;
let employeeAgent: Agent;
let inspectionId: string;

const sha = (content: string) => createHash('sha256').update(content).digest('hex');
const upload = (overrides: Record<string, unknown> = {}) => ({
  mimeType: 'image/jpeg',
  sizeBytes: 1024,
  sha256: sha('foto'),
  originalName: 'techo.jpg',
  ...overrides,
});

beforeEach(async () => {
  await resetDatabase(db);
  storage = new FakeStorage();
  ctx = createTestContext(db, {}, { storage });
  admin = (await signInWithTwoFactor(ctx, 'ADMIN')).agent;
  employee = await createUser(db, { role: 'EMPLOYEE' });
  employeeAgent = await loginAs(ctx, employee);
  const customerId = await createCustomerProfile(db);
  const propertyId = await createProperty(db, customerId);
  const start = new Date(Date.UTC(2030, 0, 2, 9));
  const appointment = await db.appointment.create({
    data: {
      customerId,
      propertyId,
      assigneeId: employee.employeeId as string,
      type: 'INSPECTION',
      startsAt: start,
      endsAt: new Date(start.getTime() + 3_600_000),
    },
  });
  const created = await admin.post('/api/inspections').send({ appointmentId: appointment.id });
  inspectionId = created.body.inspection.id as string;
});

afterAll(async () => {
  await db.$disconnect();
});

async function startUpload(agent: Agent, overrides: Record<string, unknown> = {}) {
  return agent.post(`/api/inspections/${inspectionId}/photos/uploads`).send(upload(overrides));
}

describe('fotos: crear la subida', () => {
  it('crea un File PENDING y devuelve una URL PUT firmada con tipo, tamaño y checksum', async () => {
    const res = await startUpload(employeeAgent);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const file = await db.file.findUniqueOrThrow({ where: { id: res.body.file.id } });
    expect(file).toMatchObject({
      status: 'PENDING',
      mimeType: 'image/jpeg',
      bucket: 'test-bucket',
    });
    expect(file.objectKey).toMatch(new RegExp(`^inspections/${inspectionId}/[0-9a-f-]{36}\\.jpg$`));
    expect(res.body.upload.expiresInSeconds).toBeLessThanOrEqual(300);
    expect(res.body.upload.headers).toMatchObject({
      'Content-Type': 'image/jpeg',
      'Content-Length': '1024',
    });
    expect(storage.uploads[0]).toMatchObject({ contentLength: 1024, sha256Hex: sha('foto') });
    expect(await db.auditLog.count({ where: { action: 'file.upload.create' } })).toBe(1);
  });

  it('rechaza MIME, tamaño y sha256 inválidos', async () => {
    for (const bad of [
      { mimeType: 'application/pdf' },
      { mimeType: 'image/gif' },
      { sizeBytes: 0 },
      { sizeBytes: 25 * 1024 * 1024 + 1 },
      { sizeBytes: 10.5 },
      { sha256: 'abc' },
      { sha256: 'z'.repeat(64) },
      { extra: 1 },
    ]) {
      const res = await startUpload(admin, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await db.file.count()).toBe(0);
    expect((await startUpload(admin, { sizeBytes: 25 * 1024 * 1024 })).status).toBe(201);
  });

  it('permisos: otro empleado 404, cliente 403, sin sesión 401, sin almacenamiento 503', async () => {
    const other = await loginAs(ctx, await createUser(db, { role: 'EMPLOYEE' }));
    expect((await startUpload(other)).status).toBe(404);
    const customer = await loginAs(ctx, await createUser(db, { role: 'CUSTOMER' }));
    expect((await startUpload(customer)).status).toBe(403);
    const anonymous = await request(ctx.app)
      .post(`/api/inspections/${inspectionId}/photos/uploads`)
      .set('Origin', APP_ORIGIN)
      .send(upload());
    expect(anonymous.status).toBe(401);

    const bare = createTestContext(db);
    const adminBare = (await signInWithTwoFactor(bare, 'ADMIN')).agent;
    const res = await adminBare
      .post(`/api/inspections/${inspectionId}/photos/uploads`)
      .set('Origin', APP_ORIGIN)
      .send(upload());
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('STORAGE_NOT_CONFIGURED');
  });

  it('no se suben fotos a una inspección completada', async () => {
    await admin.post(`/api/inspections/${inspectionId}/complete`).send({});
    const res = await startUpload(admin);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSPECTION_COMPLETED');
  });
});

describe('fotos: completar y descargar', () => {
  async function pending(agent: Agent = employeeAgent) {
    const res = await startUpload(agent);
    const file = await db.file.findUniqueOrThrow({ where: { id: res.body.file.id } });
    return { fileId: file.id, key: file.objectKey };
  }
  const complete = (agent: Agent, fileId: string, body: object = {}) =>
    agent.post(`/api/inspections/${inspectionId}/photos/${fileId}/complete`).send(body);

  it('con el objeto subido pasa a READY y crea la foto de la inspección', async () => {
    const { fileId, key } = await pending();
    storage.simulateUpload(key);
    const section = await admin.post(`/api/inspections/${inspectionId}/sections`).send({
      name: 'Faldón',
      areaSqft: 100,
      pitchRise: 4,
    });
    const res = await complete(employeeAgent, fileId, {
      sectionId: section.body.section.id,
      caption: 'Teja rota',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.photo).toMatchObject({ fileId, caption: 'Teja rota', inspectionId });
    expect((await db.file.findUniqueOrThrow({ where: { id: fileId } })).status).toBe('READY');
    const detail = await admin.get(`/api/inspections/${inspectionId}`);
    expect(detail.body.inspection.photos).toHaveLength(1);
    expect((await complete(employeeAgent, fileId)).status).toBe(409);
  });

  it('sin subir, o con tamaño, tipo o checksum distintos, no pasa a READY', async () => {
    const missing = await pending();
    const none = await complete(employeeAgent, missing.fileId);
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe('UPLOAD_MISSING');

    for (const [override, problem] of [
      [{ contentLength: 999 }, 'size'],
      [{ contentType: 'image/png' }, 'contentType'],
      [{ sha256Hex: sha('otra cosa') }, 'sha256'],
      [{ sha256Hex: undefined }, 'sha256'],
    ] as const) {
      const file = await pending();
      storage.simulateUpload(file.key, override);
      const res = await complete(employeeAgent, file.fileId);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'UPLOAD_MISMATCH', problems: [problem] });
      expect((await db.file.findUniqueOrThrow({ where: { id: file.fileId } })).status).toBe(
        'PENDING',
      );
    }
    expect(await db.inspectionPhoto.count()).toBe(0);
  });

  it('solo quien subió el archivo lo completa; la sección debe ser de la inspección', async () => {
    const { fileId, key } = await pending();
    storage.simulateUpload(key);
    // La oficina ve el archivo pero no lo subió ella.
    expect((await complete(admin, fileId)).status).toBe(404);
    expect((await complete(employeeAgent, fileId, { sectionId: crypto.randomUUID() })).status).toBe(
      404,
    );
    expect((await complete(employeeAgent, crypto.randomUUID())).status).toBe(404);
  });

  it('descarga: URL GET firmada solo si el File es visible y READY', async () => {
    const { fileId, key } = await pending();
    storage.simulateUpload(key);
    // PENDING: aún no se descarga.
    expect((await employeeAgent.get(`/api/files/${fileId}/download`)).status).toBe(404);
    await complete(employeeAgent, fileId);

    const mine = await employeeAgent.get(`/api/files/${fileId}/download`);
    expect(mine.status).toBe(200);
    expect(mine.body.url).toContain(key);
    expect(mine.body.expiresInSeconds).toBeLessThanOrEqual(300);
    expect((await admin.get(`/api/files/${fileId}/download`)).status).toBe(200);

    const before = storage.downloads.length;
    const other = await loginAs(ctx, await createUser(db, { role: 'EMPLOYEE' }));
    const customer = await loginAs(ctx, await createUser(db, { role: 'CUSTOMER' }));
    expect((await other.get(`/api/files/${fileId}/download`)).status).toBe(404);
    expect((await customer.get(`/api/files/${fileId}/download`)).status).toBe(404);
    expect((await admin.get(`/api/files/${crypto.randomUUID()}/download`)).status).toBe(404);
    expect((await request(ctx.app).get(`/api/files/${fileId}/download`)).status).toBe(401);
    // Si no es visible, no se firma nada.
    expect(storage.downloads.length).toBe(before);
  });
});
