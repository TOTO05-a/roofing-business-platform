import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/a11y';
import { me, mockApi, type ApiHandler } from './support/api';

const APP = 'http://localhost:4173';

const lead = (over: Record<string, unknown> = {}) => ({
  id: 'l1',
  status: 'CONTACTED',
  source: 'PHONE',
  firstName: 'Ana',
  lastName: 'Ruiz',
  email: 'ana@example.com',
  phone: '+13055550123',
  addressLine1: '1200 Brickell Ave',
  city: 'Miami',
  state: 'FL',
  zip: '33131',
  customerId: null,
  propertyId: null,
  assignedToId: null,
  createdAt: '2026-11-10T10:00:00Z',
  updatedAt: '2026-11-10T10:00:00Z',
  ...over,
});

const property = {
  id: 'p1',
  customerId: 'c1',
  addressLine1: '1200 Brickell Ave',
  city: 'Miami',
  state: 'FL',
  zip: '33131',
  createdAt: '2026-11-10T10:00:00Z',
  updatedAt: '2026-11-10T10:00:00Z',
};

function weekAppointment(over: Record<string, unknown> = {}) {
  const day = new Date();
  day.setHours(10, 0, 0, 0);
  const end = new Date(day.getTime() + 60 * 60_000);
  return {
    id: 'a1',
    propertyId: 'p1',
    customerId: 'c1',
    assigneeId: 'e1',
    type: 'INSPECTION',
    status: 'SCHEDULED',
    startsAt: day.toISOString(),
    endsAt: end.toISOString(),
    rescheduledFromId: null,
    ...over,
  };
}

const list = (key: string, rows: unknown[]) => ({
  body: { [key]: rows, page: 1, pageSize: 12, total: rows.length },
});

const common: Record<string, ApiHandler> = {
  'GET /api/employees': {
    body: { employees: [{ id: 'e1', isActive: true, user: { name: 'Luis Gómez' } }] },
  },
  'GET /api/properties': list('properties', [property]),
  'GET /api/customers': list('customers', [
    {
      id: 'c1',
      firstName: 'Ana',
      lastName: 'Ruiz',
      email: null,
      phone: null,
      marketingOptIn: false,
    },
  ]),
};

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('lang', 'es'));
});

async function expectAccessible(page: Page) {
  expect(await seriousViolations(page)).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`leads: lista y detalle accesibles (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await mockApi(page, {
      ...common,
      'GET /api/me': me('ADMIN', { twoFactorEnabled: true }),
      'GET /api/leads': list('leads', [
        lead(),
        lead({ id: 'l2', firstName: 'Beto', status: 'NEW' }),
      ]),
      'GET /api/leads/l1': { body: { lead: lead() } },
    });
    await page.goto(`${APP}/leads`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Leads');
    await expect(page.getByText('Ana Ruiz')).toBeVisible();
    await expectAccessible(page);
    await page.getByText('Ana Ruiz').click();
    await expect(page.getByRole('button', { name: 'Convertir' }).first()).toBeVisible();
    await expectAccessible(page);
  });
}

test('lead: convertir y pasar a perdido pide el motivo', async ({ page }) => {
  let current = lead();
  const requests = await mockApi(page, {
    ...common,
    'GET /api/me': me('ADMIN', { twoFactorEnabled: true }),
    'GET /api/leads/l1': () => ({ body: { lead: current } }),
    'POST /api/leads/l1/convert': () => {
      current = lead({ customerId: 'c1', propertyId: 'p1' });
      return { body: { lead: current, customerId: 'c1', propertyId: 'p1' } };
    },
    'POST /api/leads/l1/status': (body) => {
      current = lead({ status: (body as { status: string }).status });
      return { body: { lead: current } };
    },
  });
  await page.goto(`${APP}/leads/l1`);
  await page.getByRole('button', { name: 'Convertir' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Convertir' }).click();
  await expect(page.getByRole('link', { name: 'Ver propiedad' })).toBeVisible();
  await page.getByRole('button', { name: /Perdido/ }).click();
  await page.getByRole('button', { name: 'Marcar como perdido' }).click();
  await expect(page.getByText('El motivo es obligatorio.')).toBeVisible();
  await page.getByRole('textbox', { name: /Motivo/ }).fill('Sin presupuesto');
  await page.getByRole('button', { name: 'Marcar como perdido' }).click();
  await expect(page.getByText('Perdido').first()).toBeVisible();
  expect(requests.find((r) => r.key === 'POST /api/leads/l1/status')?.body).toEqual({
    status: 'LOST',
    lostReason: 'Sin presupuesto',
  });
});

test('empleado: la API manda lo visible (404) y no ve clientes', async ({ page }) => {
  await mockApi(page, {
    ...common,
    'GET /api/me': me('EMPLOYEE'),
    'GET /api/leads/zz': { status: 404, body: { error: { code: 'NOT_FOUND', message: 'x' } } },
  });
  await page.goto(`${APP}/leads/zz`);
  await expect(page.getByText('No encontramos este registro')).toBeVisible();
  await expectAccessible(page);
  await page.goto(`${APP}/clientes`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Acceso denegado');
});

test('clientes y propiedades: listas y fichas accesibles', async ({ page }) => {
  await mockApi(page, {
    ...common,
    'GET /api/me': me('ADMIN', { twoFactorEnabled: true }),
    'GET /api/customers/c1': {
      body: {
        customer: {
          id: 'c1',
          firstName: 'Ana',
          lastName: 'Ruiz',
          email: 'a@x.com',
          phone: null,
          marketingOptIn: false,
          userId: null,
        },
      },
    },
    'GET /api/appointments': { body: { appointments: [], page: 1, pageSize: 50, total: 0 } },
    'GET /api/inspections': { body: { inspections: [], page: 1, pageSize: 50, total: 0 } },
  });
  await page.goto(`${APP}/clientes`);
  await expect(page.getByText('Ana Ruiz')).toBeVisible();
  await expectAccessible(page);
  await page.getByText('Ana Ruiz').click();
  await expect(page.getByText('1200 Brickell Ave')).toBeVisible();
  await expectAccessible(page);
  await page.goto(`${APP}/propiedades`);
  await expect(page.getByText('1200 Brickell Ave').first()).toBeVisible();
  await expectAccessible(page);
});

test('agenda: semana, reprogramar con formulario y error de solape en es/en', async ({ page }) => {
  await mockApi(page, {
    ...common,
    'GET /api/me': me('ADMIN', { twoFactorEnabled: true }),
    'GET /api/appointments': {
      body: { appointments: [weekAppointment()], page: 1, pageSize: 100, total: 1 },
    },
    'POST /api/appointments/a1/reschedule': {
      status: 409,
      body: {
        error: {
          code: 'APPOINTMENT_OVERLAP',
          message: 'x',
          messages: {
            es: 'El empleado ya tiene una cita en ese horario. Elige otra hora u otro empleado.',
            en: 'The employee already has an appointment during that time. Choose another time or employee.',
          },
        },
      },
    },
  });
  await page.goto(`${APP}/agenda`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda de trabajos');
  await expectAccessible(page);
  await page
    .getByRole('button', { name: /Inspección/ })
    .first()
    .click();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Reprogramar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reprogramar' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Horario ocupado');
  await expect(alert).toContainText('ya tiene una cita en ese horario');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await page
    .getByRole('button', { name: /Inspection/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Reschedule' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reschedule' }).click();
  await expect(page.getByRole('alert')).toContainText('already has an appointment');
});

test('inspección: secciones con medidas y subida de foto con URL firmada', async ({ page }) => {
  const inspection = {
    id: 'i1',
    appointmentId: 'a1',
    propertyId: 'p1',
    inspectorId: 'e1',
    status: 'DRAFT',
    completedAt: null,
    roofType: null,
    roofAgeYears: null,
    findings: null,
    createdAt: '2026-11-10T10:00:00Z',
    updatedAt: '2026-11-10T10:00:00Z',
    sections: [] as unknown[],
    photos: [] as unknown[],
  };
  const requests = await mockApi(page, {
    ...common,
    'GET /api/me': me('EMPLOYEE'),
    'GET /api/inspections/i1': () => ({ body: { inspection } }),
    'POST /api/inspections/i1/sections': (body) => {
      const section = {
        id: 's1',
        inspectionId: 'i1',
        ridgeFt: 0,
        eaveFt: 0,
        hipFt: 0,
        valleyFt: 0,
        gutterFt: 0,
        sortOrder: 0,
        notes: null,
        ...(body as object),
      };
      inspection.sections = [section];
      return { status: 201, body: { section } };
    },
    'POST /api/inspections/i1/photos/uploads': {
      status: 201,
      body: {
        file: { id: 'f1' },
        upload: {
          url: `${APP}/__signed-put`,
          headers: { 'Content-Type': 'image/png' },
          expiresInSeconds: 300,
        },
      },
    },
    'POST /api/inspections/i1/photos/f1/complete': () => {
      inspection.photos = [
        { id: 'ph1', sectionId: null, fileId: 'f1', caption: null, takenAt: null },
      ];
      return { status: 201, body: { photo: inspection.photos[0] } };
    },
    'GET /api/files/f1/download': {
      body: { url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', mimeType: 'image/gif' },
    },
  });
  await page.route('**/__signed-put', (route) => route.fulfill({ status: 200, body: '' }));
  await page.goto(`${APP}/inspecciones/i1`);
  await expect(page.getByText('Aún no hay secciones')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Agregar sección' }).click();
  await page.getByLabel(/^Nombre/).fill('Plano frontal');
  await page.getByLabel(/^Área/).fill('850');
  await page.getByLabel(/^Pendiente/).fill('6,5');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Plano frontal')).toBeVisible();
  expect(requests.find((r) => r.key === 'POST /api/inspections/i1/sections')?.body).toMatchObject({
    name: 'Plano frontal',
    areaSqft: 850,
    pitchRise: 6.5,
  });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await page
    .locator('#photo-input')
    .setInputFiles({ name: 'techo.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('img', { name: 'Foto de la inspección 1' })).toBeVisible();
  await expectAccessible(page);
});

for (const size of [
  { width: 390, height: 844 },
  { width: 834, height: 1112 },
  { width: 1512, height: 900 },
]) {
  test(`agenda del cliente sin desbordes a ${size.width} px`, async ({ page }) => {
    await page.setViewportSize(size);
    await mockApi(page, {
      ...common,
      'GET /api/me': me('CUSTOMER'),
      'GET /api/appointments': {
        body: { appointments: [weekAppointment()], page: 1, pageSize: 100, total: 1 },
      },
    });
    await page.goto(`${APP}/citas`);
    await expect(page.getByRole('button', { name: /Inspección/ }).first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await expectAccessible(page);
  });
}
