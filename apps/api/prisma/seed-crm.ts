/**
 * Datos de demostración del CRM (solo con SEED_DEMO=true): clientes, propiedades del Sur de
 * Florida, leads en varios estados (incluido un SPAM), citas pasadas y futuras sin solapes y
 * una inspección con secciones. Todo es ficticio: calles inventadas, teléfonos +1305555 01xx
 * y correos `.example`. Es idempotente: si ya existe la marca del seed, no hace nada.
 */
import type { createDb } from '../src/lib/db.js';

type Db = ReturnType<typeof createDb>;

const DAY = 86_400_000;
const MARKER_EMAIL = 'marta.ruiz@demo-clientes.example';

/** Fecha a las `hour` h UTC, `offsetDays` días desde hoy (negativo = pasado). */
function at(offsetDays: number, hour: number): Date {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  return new Date(base.getTime() + offsetDays * DAY + hour * 3_600_000);
}

const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 3_600_000);

interface DemoCustomer {
  key: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  property: { addressLine1: string; city: string; zip: string; yearBuilt: number };
}

const NEW_CUSTOMERS: DemoCustomer[] = [
  {
    key: 'marta',
    firstName: 'Marta',
    lastName: 'Ruiz',
    email: MARKER_EMAIL,
    phone: '+13055550101',
    property: {
      addressLine1: '2310 Calle Ficticia Oeste',
      city: 'Miami',
      zip: '33145',
      yearBuilt: 1974,
    },
  },
  {
    key: 'luis',
    firstName: 'Luis',
    lastName: 'Ferrer',
    email: 'luis.ferrer@demo-clientes.example',
    phone: '+13055550102',
    property: {
      addressLine1: '415 Avenida Imaginaria',
      city: 'Hialeah',
      zip: '33012',
      yearBuilt: 1988,
    },
  },
  {
    key: 'sofia',
    firstName: 'Sofía',
    lastName: 'Benítez',
    email: 'sofia.benitez@demo-clientes.example',
    phone: '+13055550103',
    property: {
      addressLine1: '1801 Paseo de Muestra',
      city: 'Fort Lauderdale',
      zip: '33304',
      yearBuilt: 2003,
    },
  },
  {
    key: 'daniel',
    firstName: 'Daniel',
    lastName: 'Cruz',
    email: 'daniel.cruz@demo-clientes.example',
    phone: '+13055550104',
    property: {
      addressLine1: '950 Camino Inventado',
      city: 'Boca Raton',
      zip: '33486',
      yearBuilt: 1995,
    },
  },
];

const CLARA_PROPERTIES = [
  { addressLine1: '1420 Calle de Ejemplo Norte', city: 'Doral', zip: '33172', yearBuilt: 2008 },
  { addressLine1: '88 Plaza Ficticia', city: 'Coral Gables', zip: '33134', yearBuilt: 1962 },
];

export async function seedDemoCrm(db: Db): Promise<void> {
  if (await db.customerProfile.findFirst({ where: { email: MARKER_EMAIL } })) {
    console.log('Los datos demo del CRM ya existen; no se modifican.');
    return;
  }
  const clara = await db.customerProfile.findFirst({
    where: { email: 'cliente@cresta-roofing.example' },
  });
  const employee = await db.employeeProfile.findFirst({
    where: { user: { email: 'empleado@cresta-roofing.example' } },
  });
  if (!clara || !employee) {
    console.log('Faltan el cliente o el empleado demo; se omiten los datos demo del CRM.');
    return;
  }

  await db.$transaction(async (tx) => {
    const customers: Record<string, string> = {};
    const properties: Record<string, string> = {};

    const claraDoral = await tx.property.create({
      data: { customerId: clara.id, state: 'FL', ...CLARA_PROPERTIES[0]! },
    });
    const claraGables = await tx.property.create({
      data: { customerId: clara.id, state: 'FL', ...CLARA_PROPERTIES[1]! },
    });
    customers.clara = clara.id;
    properties.claraDoral = claraDoral.id;
    properties.claraGables = claraGables.id;

    for (const demo of NEW_CUSTOMERS) {
      const customer = await tx.customerProfile.create({
        data: {
          firstName: demo.firstName,
          lastName: demo.lastName,
          email: demo.email,
          phone: demo.phone,
          preferredContact: 'PHONE',
        },
      });
      const property = await tx.property.create({
        data: { customerId: customer.id, state: 'FL', ...demo.property },
      });
      customers[demo.key] = customer.id;
      properties[demo.key] = property.id;
    }

    const appointment = (
      customerKey: string,
      propertyKey: string,
      startsAt: Date,
      extra: {
        type?: 'INSPECTION' | 'FOLLOW_UP' | 'ESTIMATE_PRESENTATION';
        status?: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';
        cancelReason?: string;
        notes?: string;
        leadId?: string;
      } = {},
    ) =>
      tx.appointment.create({
        data: {
          customerId: customers[customerKey]!,
          propertyId: properties[propertyKey]!,
          assigneeId: employee.id,
          type: extra.type ?? 'INSPECTION',
          startsAt,
          endsAt: addHours(startsAt, 1),
          status: extra.status ?? 'SCHEDULED',
          ...(extra.cancelReason ? { cancelReason: extra.cancelReason } : {}),
          ...(extra.notes ? { notes: extra.notes } : {}),
          ...(extra.leadId ? { leadId: extra.leadId } : {}),
        },
      });

    // --- Leads en varios estados (cada uno con un teléfono ficticio distinto) ---
    const lead = (data: {
      status:
        | 'NEW'
        | 'CONTACTED'
        | 'APPOINTMENT_SET'
        | 'INSPECTED'
        | 'QUOTED'
        | 'LOST'
        | 'SPAM'
        | 'DUPLICATE';
      source: 'WEB_FORM' | 'PHONE' | 'REFERRAL' | 'DOOR_KNOCK';
      firstName: string;
      lastName?: string;
      email?: string;
      phone?: string;
      message?: string;
      city?: string;
      zip?: string;
      daysAgo: number;
      assigned?: boolean;
      customerKey?: string;
      propertyKey?: string;
      lostReason?: string;
      spamReason?: string;
    }) =>
      tx.lead.create({
        data: {
          status: data.status,
          source: data.source,
          firstName: data.firstName,
          ...(data.lastName ? { lastName: data.lastName } : {}),
          ...(data.email ? { email: data.email } : {}),
          ...(data.phone ? { phone: data.phone } : {}),
          ...(data.message ? { message: data.message } : {}),
          ...(data.city ? { city: data.city, state: 'FL' } : {}),
          ...(data.zip ? { zip: data.zip } : {}),
          ...(data.assigned ? { assignedToId: employee.id } : {}),
          ...(data.customerKey ? { customerId: customers[data.customerKey]! } : {}),
          ...(data.propertyKey ? { propertyId: properties[data.propertyKey]! } : {}),
          ...(data.lostReason ? { lostReason: data.lostReason } : {}),
          ...(data.spamReason ? { spamReason: data.spamReason } : {}),
          createdAt: new Date(Date.now() - data.daysAgo * DAY),
        },
      });

    await lead({
      status: 'NEW',
      source: 'WEB_FORM',
      firstName: 'Roberto',
      lastName: 'Vega',
      email: 'roberto.vega@demo-leads.example',
      phone: '+13055550161',
      message: 'Hay una mancha de humedad en el techo del cuarto principal.',
      city: 'Miami',
      zip: '33155',
      daysAgo: 0,
    });
    await lead({
      status: 'CONTACTED',
      source: 'PHONE',
      firstName: 'Elena',
      lastName: 'Soto',
      phone: '+13055550162',
      message: 'Quiere cotizar el cambio de teja de barro.',
      city: 'Coral Gables',
      zip: '33146',
      daysAgo: 3,
      assigned: true,
    });
    await lead({
      status: 'DUPLICATE',
      source: 'WEB_FORM',
      firstName: 'Elena',
      lastName: 'Soto',
      email: 'elena.soto@demo-leads.example',
      phone: '+13055550162',
      daysAgo: 3,
    });
    await lead({
      status: 'LOST',
      source: 'REFERRAL',
      firstName: 'Pablo',
      lastName: 'Núñez',
      phone: '+13055550163',
      city: 'Doral',
      zip: '33178',
      daysAgo: 20,
      lostReason: 'Eligió a otra empresa por el precio',
    });
    await lead({
      status: 'SPAM',
      source: 'WEB_FORM',
      firstName: 'Seo',
      lastName: 'Promo',
      email: 'promo@spam-bot.example',
      message: 'Compre seguidores baratos en nuestro sitio.',
      daysAgo: 1,
      spamReason: 'honeypot',
    });

    const danielLead = await lead({
      status: 'APPOINTMENT_SET',
      source: 'DOOR_KNOCK',
      firstName: 'Daniel',
      lastName: 'Cruz',
      email: 'daniel.cruz@demo-clientes.example',
      phone: '+13055550104',
      daysAgo: 6,
      assigned: true,
      customerKey: 'daniel',
      propertyKey: 'daniel',
    });
    const claraLead = await lead({
      status: 'INSPECTED',
      source: 'WEB_FORM',
      firstName: 'Clara',
      lastName: 'Demo',
      email: 'cliente@cresta-roofing.example',
      phone: '+13055550143',
      message: 'Quiero revisar el techo antes de la temporada de huracanes.',
      daysAgo: 18,
      assigned: true,
      customerKey: 'clara',
      propertyKey: 'claraDoral',
    });
    await lead({
      status: 'QUOTED',
      source: 'PHONE',
      firstName: 'Marta',
      lastName: 'Ruiz',
      email: MARKER_EMAIL,
      phone: '+13055550101',
      daysAgo: 9,
      customerKey: 'marta',
      propertyKey: 'marta',
    });

    // --- Citas: pasadas y futuras, un solo empleado, en días distintos (sin solapes) ---
    const completed = await appointment('clara', 'claraDoral', at(-14, 14), {
      status: 'COMPLETED',
      leadId: claraLead.id,
      notes: 'Inspección completa de teja asfáltica.',
    });
    await appointment('marta', 'marta', at(-8, 15), { status: 'COMPLETED' });
    await appointment('luis', 'luis', at(-5, 10), { status: 'NO_SHOW' });
    await appointment('sofia', 'sofia', at(-2, 16), {
      status: 'CANCELED',
      cancelReason: 'La clienta pidió moverla por viaje.',
    });
    await appointment('sofia', 'sofia', at(2, 13), { status: 'CONFIRMED' });
    await appointment('daniel', 'daniel', at(4, 10), { leadId: danielLead.id });
    await appointment('clara', 'claraGables', at(9, 15), {
      type: 'FOLLOW_UP',
      notes: 'Revisar medidas del segundo inmueble.',
    });
    await appointment('marta', 'marta', at(12, 11), { type: 'ESTIMATE_PRESENTATION' });

    // --- Una inspección completada con secciones ---
    const inspection = await tx.inspection.create({
      data: {
        appointmentId: completed.id,
        propertyId: properties.claraDoral!,
        inspectorId: employee.id,
        status: 'COMPLETED',
        completedAt: addHours(completed.startsAt, 2),
        roofType: 'ASPHALT_SHINGLE',
        roofAgeYears: 14,
        findings: 'Tejas levantadas en el faldón sur y sellado desgastado en la chimenea.',
      },
    });
    await tx.inspectionSection.createMany({
      data: [
        {
          name: 'Faldón sur',
          areaSqft: '820.5',
          pitchRise: '6',
          ridgeFt: '32',
          eaveFt: '41.5',
          sortOrder: 1,
        },
        {
          name: 'Faldón norte',
          areaSqft: '790',
          pitchRise: '6',
          ridgeFt: '32',
          eaveFt: '39',
          sortOrder: 2,
        },
        {
          name: 'Porche',
          areaSqft: '145.25',
          pitchRise: '3.5',
          eaveFt: '18',
          gutterFt: '18',
          sortOrder: 3,
        },
      ].map((section) => ({ inspectionId: inspection.id, ...section })),
    });

    await tx.auditLog.create({
      data: {
        action: 'seed.demo_crm',
        entityType: 'seed',
        after: {
          customers: Object.keys(customers).length,
          properties: Object.keys(properties).length,
        },
      },
    });
  });
  console.log('Datos demo del CRM creados (clientes, propiedades, leads, citas e inspección).');
}
