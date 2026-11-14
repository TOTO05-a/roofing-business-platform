import { createHash } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeStorage } from './fake-storage.js';
import {
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

beforeEach(async () => {
  await resetDatabase(db);
  storage = new FakeStorage();
  ctx = createTestContext(db, {}, { storage });
  admin = (await signInWithTwoFactor(ctx, 'ADMIN')).agent;
});

afterAll(async () => {
  await db.$disconnect();
});

const MEASUREMENTS = {
  sections: [{ name: 'Principal', areaSqFt: 2000, areaKind: 'PLAN', pitchRise: 6 }],
  ridgeFt: 40,
  eavesFt: 120,
};

/** Catálogo mínimo con un paquete: material por square (rollos de 1), mano de obra y un fijo. */
async function seedCatalog(agent: Agent) {
  const matCat = (
    await agent.post('/api/catalog/categories').send({ name: 'Tejas', kind: 'MATERIAL' })
  ).body.category.id as string;
  const laborCat = (
    await agent.post('/api/catalog/categories').send({ name: 'Instalación', kind: 'LABOR' })
  ).body.category.id as string;
  const shingle = (
    await agent.post('/api/catalog/items').send({
      categoryId: matCat,
      kind: 'MATERIAL',
      name: 'Teja asfáltica',
      unit: 'SQUARE',
      materialPriceCents: 12000,
    })
  ).body.item.id as string;
  await agent
    .post(`/api/catalog/items/${shingle}/purchase-units`)
    .send({ name: 'paquete', baseUnitsPerPurchaseUnit: 0.333, isDefault: true });
  const color = (
    await agent
      .post(`/api/catalog/items/${shingle}/material-options`)
      .send({ kind: 'COLOR', name: 'Gris pizarra', hex: '#4A5560' })
  ).body.materialOption.id as string;
  const labor = (
    await agent.post('/api/catalog/items').send({
      categoryId: laborCat,
      kind: 'LABOR',
      name: 'Instalación de teja',
      unit: 'SQUARE',
      laborPriceCents: 8000,
    })
  ).body.item.id as string;
  const permit = (
    await agent.post('/api/catalog/items').send({
      categoryId: laborCat,
      kind: 'LABOR',
      name: 'Permisos',
      unit: 'UNIT',
      laborPriceCents: 45000,
    })
  ).body.item.id as string;
  const pkg = await agent.post('/api/catalog/packages').send({
    tier: 'BASIC',
    name: 'Básico asfalto',
    warrantyText: 'Mano de obra 5 años',
    warrantyYears: 5,
    lines: [
      { itemId: shingle, quantityRule: 'PER_SQUARE', factor: 1, defaultMaterialOptionId: color },
      { itemId: labor, quantityRule: 'PER_SQUARE', factor: 1 },
      { itemId: permit, quantityRule: 'FIXED', factor: 1 },
    ],
  });
  expect(pkg.status, JSON.stringify(pkg.body)).toBe(201);
  return { packageId: pkg.body.package.id as string, shingle };
}

async function customerWithProperty() {
  const customer = await createUser(db, { role: 'CUSTOMER' });
  const propertyId = await createProperty(db, customer.customerId!);
  return { customer, propertyId };
}

async function createQuote(agent: Agent, propertyId: string, packageId: string, extra = {}) {
  const res = await agent.post('/api/quotes').send({
    propertyId,
    measurements: MEASUREMENTS,
    packageIds: [packageId],
    ...extra,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as {
    quote: { id: string; number: string };
    version: {
      id: string;
      options: {
        totalCents: number;
        discountCents: number;
        taxCents: number;
        depositCents: number;
        balanceCents: number;
        materialSubtotalCents: number;
        laborSubtotalCents: number;
        lines: unknown[];
      }[];
    };
  };
}

describe('catálogo (solo administración)', () => {
  it('la oficina lo gestiona; ventas, cuadrilla y clientes no lo ven ni lo cambian', async () => {
    const { packageId, shingle } = await seedCatalog(admin);
    const patched = await admin
      .patch(`/api/catalog/items/${shingle}`)
      .send({ materialPriceCents: 13000 });
    expect(patched.status).toBe(200);
    expect((await admin.get('/api/catalog/items')).body.total).toBe(3);
    expect((await admin.get(`/api/catalog/packages/${packageId}`)).body.package.items).toHaveLength(
      3,
    );
    // Un artículo en un paquete activo no se borra.
    expect((await admin.delete(`/api/catalog/items/${shingle}`)).status).toBe(409);

    const sales = await createUser(db, { role: 'EMPLOYEE' });
    const customer = await createUser(db, { role: 'CUSTOMER' });
    for (const user of [sales, customer]) {
      const agent = await loginAs(ctx, user);
      expect((await agent.get('/api/catalog/items')).status).toBe(403);
      expect(
        (await agent.post('/api/catalog/categories').send({ name: 'X', kind: 'MATERIAL' })).status,
      ).toBe(403);
    }
  });

  it('valida: mano de obra sin precio de material, categoría del mismo tipo', async () => {
    const cat = (await admin.post('/api/catalog/categories').send({ name: 'M', kind: 'MATERIAL' }))
      .body.category.id;
    const wrongKind = await admin
      .post('/api/catalog/items')
      .send({ categoryId: cat, kind: 'LABOR', name: 'x', unit: 'UNIT' });
    expect(wrongKind.status).toBe(409);
    const labor = await admin.post('/api/catalog/items').send({
      categoryId: cat,
      kind: 'LABOR',
      name: 'x',
      unit: 'UNIT',
      materialPriceCents: 5,
    });
    expect(labor.status).toBe(400);
  });
});

describe('presupuestos: cálculo con el motor', () => {
  it('calcula con descuento antes del impuesto, impuesto sobre mano de obra opcional y anticipo', async () => {
    const { packageId } = await seedCatalog(admin);
    const { propertyId } = await customerWithProperty();
    const base = await createQuote(admin, propertyId, packageId);
    const option = base.version.options[0]!;
    // 2000 ft² con pendiente 6/12 = 22.36 squares; el motor redondea las cantidades de compra.
    expect(option.totalCents).toBe(
      option.materialSubtotalCents +
        option.laborSubtotalCents -
        option.discountCents +
        option.taxCents,
    );
    expect(option.depositCents + option.balanceCents).toBe(option.totalCents);
    expect(option.discountCents).toBe(0);
    expect(base.version.options[0]!.lines).toHaveLength(3);

    // 10 % de descuento y el impuesto también sobre la mano de obra.
    const quoteId = base.quote.id;
    const patched = await admin
      .patch(`/api/quotes/${quoteId}/versions/${base.version.id}`)
      .send({ parameters: { discountBps: 1000, taxAppliesToLabor: true, depositBps: 3000 } });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    const changed = patched.body.version.options[0];
    const subtotal = changed.materialSubtotalCents + changed.laborSubtotalCents;
    expect(changed.discountCents).toBe(Math.round(subtotal * 0.1));
    expect(changed.taxCents).toBe(Math.round((subtotal - changed.discountCents) * 0.07));
    expect(changed.depositCents).toBe(Math.round(changed.totalCents * 0.3));
  });

  it('rechaza el descuento de quien no es administración y paquetes inexistentes', async () => {
    const { packageId } = await seedCatalog(admin);
    const { propertyId } = await customerWithProperty();
    const sales = await loginAs(ctx, await createUser(db, { role: 'EMPLOYEE' }));
    expect(
      (
        await sales.post('/api/quotes').send({
          propertyId,
          measurements: MEASUREMENTS,
          packageIds: [packageId],
          parameters: { discountBps: 500 },
        })
      ).status,
    ).toBe(403);
    const ghost = await admin.post('/api/quotes').send({
      propertyId,
      measurements: MEASUREMENTS,
      packageIds: ['019ad000-0000-7000-8000-000000000000'],
    });
    expect(ghost.status).toBe(404);
    const both = await admin.post('/api/quotes').send({
      propertyId,
      packageIds: [packageId],
    });
    expect(both.status).toBe(400);
  });
});

describe('presupuestos: enviar, PDF e inmutabilidad', () => {
  it('al enviar congela la versión, guarda el PDF con su sha256 y los cambios de precio no la alteran', async () => {
    const { packageId, shingle } = await seedCatalog(admin);
    const { customer, propertyId } = await customerWithProperty();
    const { quote, version } = await createQuote(admin, propertyId, packageId);
    const before = (await admin.get(`/api/quotes/${quote.id}/versions/${version.id}`)).body.version;

    const sent = await admin.post(`/api/quotes/${quote.id}/versions/${version.id}/send`).send({});
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.version).toMatchObject({ status: 'SENT' });
    expect(sent.body.version.lockedAt).toBeTruthy();
    expect(sent.body.version.pdfSha256).toMatch(/^[0-9a-f]{64}$/);

    // El PDF existe en el almacenamiento, es un PDF y su hash coincide.
    const [[key, bytes]] = [...storage.blobs.entries()];
    expect(key).toMatch(new RegExp(`^quotes/${quote.id}/.+\\.pdf$`));
    expect(Buffer.from(bytes!).subarray(0, 5).toString()).toBe('%PDF-');
    expect(createHash('sha256').update(bytes!).digest('hex')).toBe(sent.body.version.pdfSha256);

    // Subir el precio del catálogo no cambia lo enviado (P13).
    await admin.patch(`/api/catalog/items/${shingle}`).send({ materialPriceCents: 99999 });
    const after = (await admin.get(`/api/quotes/${quote.id}/versions/${version.id}`)).body.version;
    expect(after.options).toEqual(before.options);

    // No se edita ni se reenvía una versión enviada; la base de datos también lo impide.
    expect(
      (await admin.patch(`/api/quotes/${quote.id}/versions/${version.id}`).send({ notes: 'x' }))
        .status,
    ).toBe(409);
    expect(
      (await admin.post(`/api/quotes/${quote.id}/versions/${version.id}/send`).send({})).status,
    ).toBe(409);
    await expect(
      db.quoteVersion.update({ where: { id: version.id }, data: { discountBps: 5000 } }),
    ).rejects.toThrow(/no se puede modificar/);

    // Descarga con URL firmada.
    const pdf = await admin.get(`/api/quotes/${quote.id}/versions/${version.id}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.body.url).toContain(key);
    void customer;
  });

  it('una versión nueva sustituye a la anterior (SUPERSEDED) y solo hay un borrador a la vez', async () => {
    const { packageId } = await seedCatalog(admin);
    const { propertyId } = await customerWithProperty();
    const { quote, version: v1 } = await createQuote(admin, propertyId, packageId);
    await admin.post(`/api/quotes/${quote.id}/versions/${v1.id}/send`).send({});
    const v2 = await admin.post(`/api/quotes/${quote.id}/versions`).send({});
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);
    expect(v2.body.version.versionNumber).toBe(2);
    expect((await admin.post(`/api/quotes/${quote.id}/versions`).send({})).status).toBe(409);
    await admin
      .patch(`/api/quotes/${quote.id}/versions/${v2.body.version.id}`)
      .send({ parameters: { discountBps: 500 } });
    const sent = await admin
      .post(`/api/quotes/${quote.id}/versions/${v2.body.version.id}/send`)
      .send({});
    expect(sent.status).toBe(200);
    const detail = (await admin.get(`/api/quotes/${quote.id}`)).body.quote;
    expect(
      detail.versions.map(
        (v: { versionNumber: number; status: string }) => `${v.versionNumber}:${v.status}`,
      ),
    ).toEqual(['2:SENT', '1:SUPERSEDED']);
  });
});

describe('presupuestos: visibilidad y estados', () => {
  let customer: CreatedUser;
  let quoteId: string;
  let versionId: string;
  let salesRep: CreatedUser;
  let otherSales: CreatedUser;
  let crew: CreatedUser;

  beforeEach(async () => {
    const { packageId } = await seedCatalog(admin);
    const made = await customerWithProperty();
    customer = made.customer;
    salesRep = await createUser(db, { role: 'EMPLOYEE' });
    otherSales = await createUser(db, { role: 'EMPLOYEE' });
    crew = await createUser(db, { role: 'EMPLOYEE' });
    await db.employeeProfile.update({
      where: { id: crew.employeeId! },
      data: { jobTypes: ['CREW_LEAD'] },
    });
    const { quote, version } = await createQuote(admin, made.propertyId, packageId, {
      salesRepId: salesRep.employeeId,
    });
    quoteId = quote.id;
    versionId = version.id;
  });

  it('un borrador solo lo ve la oficina; enviado: ventas el suyo, el cliente el suyo, la cuadrilla nada', async () => {
    const asCustomer = await loginAs(ctx, customer);
    const asSales = await loginAs(ctx, salesRep);
    const asOther = await loginAs(ctx, otherSales);
    const asCrew = await loginAs(ctx, crew);

    // Borrador: ventas ve el presupuesto pero no la versión; el cliente, nada.
    expect((await asCustomer.get(`/api/quotes/${quoteId}`)).status).toBe(404);
    expect((await asSales.get(`/api/quotes/${quoteId}/versions/${versionId}`)).status).toBe(404);

    await admin.post(`/api/quotes/${quoteId}/versions/${versionId}/send`).send({});

    expect((await asCustomer.get(`/api/quotes/${quoteId}/versions/${versionId}`)).status).toBe(200);
    expect((await asSales.get(`/api/quotes/${quoteId}/versions/${versionId}`)).status).toBe(200);
    expect((await asCustomer.get('/api/quotes')).body.total).toBe(1);
    expect((await asSales.get('/api/quotes')).body.total).toBe(1);
    for (const stranger of [asOther, asCrew]) {
      expect((await stranger.get(`/api/quotes/${quoteId}`)).status).toBe(404);
      expect((await stranger.get('/api/quotes')).body.total).toBe(0);
      expect((await stranger.get(`/api/quotes/${quoteId}/versions/${versionId}/pdf`)).status).toBe(
        404,
      );
    }
    // Otro cliente tampoco.
    const other = await loginAs(ctx, await createUser(db, { role: 'CUSTOMER' }));
    expect((await other.get(`/api/quotes/${quoteId}`)).status).toBe(404);
    // Ventas y cuadrilla no cambian estados; el PDF sí lo descarga quien lo ve.
    expect(
      (await asSales.post(`/api/quotes/${quoteId}/versions/${versionId}/decline`).send({})).status,
    ).toBe(403);
    expect((await asCustomer.get(`/api/quotes/${quoteId}/versions/${versionId}/pdf`)).status).toBe(
      200,
    );
    // Ni crear ni enviar presupuestos.
    expect(
      (await asSales.post(`/api/quotes/${quoteId}/versions/${versionId}/send`).send({})).status,
    ).toBe(403);
  });

  it('SENT → VIEWED (idempotente) → DECLINED; después no se puede volver atrás', async () => {
    await admin.post(`/api/quotes/${quoteId}/versions/${versionId}/send`).send({});
    const asCustomer = await loginAs(ctx, customer);
    const url = `/api/quotes/${quoteId}/versions/${versionId}`;
    expect((await asCustomer.post(`${url}/view`).send({})).body.version.status).toBe('VIEWED');
    expect((await asCustomer.post(`${url}/view`).send({})).body.version.status).toBe('VIEWED');
    const declined = await asCustomer.post(`${url}/decline`).send({ reason: 'Muy caro' });
    expect(declined.body.version).toMatchObject({ status: 'DECLINED', declineReason: 'Muy caro' });
    expect((await asCustomer.post(`${url}/decline`).send({})).status).toBe(409);
    expect((await asCustomer.post(`${url}/view`).send({})).status).toBe(409);
    // Se puede revisar y reenviar como versión nueva.
    expect((await admin.post(`/api/quotes/${quoteId}/versions`).send({})).status).toBe(201);
  });

  it('EXPIRED solo cuando ya pasó valid_until', async () => {
    await admin.post(`/api/quotes/${quoteId}/versions/${versionId}/send`).send({});
    const url = `/api/quotes/${quoteId}/versions/${versionId}/expire`;
    expect((await admin.post(url).send({})).body.error.code).toBe('NOT_EXPIRED_YET');
    // Viaje en el tiempo solo en la prueba: el disparador de inmutabilidad impide cambiar valid_until.
    await db.$transaction([
      db.$executeRawUnsafe('ALTER TABLE quote_versions DISABLE TRIGGER quote_versions_guard'),
      db.$executeRawUnsafe(
        `UPDATE quote_versions SET valid_until = now() - interval '1 day' WHERE id = '${versionId}'`,
      ),
      db.$executeRawUnsafe('ALTER TABLE quote_versions ENABLE TRIGGER quote_versions_guard'),
    ]);
    expect((await admin.post(url).send({})).body.version.status).toBe('EXPIRED');
  });

  it('cada operación queda en la auditoría', async () => {
    await admin.post(`/api/quotes/${quoteId}/versions/${versionId}/send`).send({});
    const actions = (await db.auditLog.findMany({ where: { entityId: quoteId } }))
      .map((a) => a.action)
      .sort();
    expect(actions).toEqual(['quote.create', 'quote.send']);
  });
});
