/**
 * Seed demo «rico» (solo con SEED_DEMO=true): completa la demo simulada (N17) con unos 26 clientes
 * con propiedades, leads en todos los estados, citas de esta semana y la siguiente, inspecciones,
 * presupuestos en todos los estados, proyectos en varias etapas con cuadrilla y fotos, y facturas
 * con pagos SIMULADOS. Todo es ficticio: calles inventadas del Sur de Florida, teléfonos
 * +1305555 01xx y correos `.example`. Las fechas son relativas a «hoy». Idempotente: si ya existe
 * la marca, no hace nada. Los PDF y las fotos necesitan el almacenamiento S3 (Garage).
 */
import { createHash, randomUUID } from 'node:crypto';
import { calculateForPackages, snapshotOf, storeOptions } from '../src/domain/quote-calc.js';
import { toPdfData } from '../src/domain/quote-pdf-data.js';
import { projectFromApproval } from '../src/domain/projects.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import type { createDb } from '../src/lib/db.js';
import type { Storage } from '../src/lib/storage.js';
import { renderQuotePdf } from '../src/pdf/quote-pdf.js';
import { demoPhoto, type DemoPhase } from './seed-demo-fotos.js';
import { seedStorage } from './seed-presupuestos.js';

type Db = ReturnType<typeof createDb>;
type Tx = Prisma.TransactionClient;

interface BuiltQuote {
  project?: { id: string };
  startsAt?: Date;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MARKER_EMAIL = 'valentina.mora@demo-clientes.example';
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * HOUR);

// --- Personas y lugares ficticios ----------------------------------------------------------

const EXTRA_EMPLOYEES = [
  {
    name: 'Gabriela Ortiz',
    email: 'gabriela.ortiz@cresta-roofing.example',
    jobs: ['SALES', 'INSPECTOR'],
  },
  { name: 'Iván Peña', email: 'ivan.pena@cresta-roofing.example', jobs: ['INSPECTOR'] },
  { name: 'Rafael Quintero', email: 'rafael.quintero@cresta-roofing.example', jobs: ['CREW_LEAD'] },
  { name: 'Mateo Salazar', email: 'mateo.salazar@cresta-roofing.example', jobs: ['CREW_LEAD'] },
  { name: 'Diego Rojas', email: 'diego.rojas@cresta-roofing.example', jobs: ['CREW_LEAD'] },
] as const;

const CUSTOMERS: [
  first: string,
  last: string,
  street: string,
  city: string,
  zip: string,
  year: number,
][] = [
  ['Valentina', 'Mora', '7120 Calle del Mirador', 'Miami', '33173', 1991],
  ['Andrés', 'Paredes', '312 Avenida Palmera', 'Hialeah', '33015', 1985],
  ['Camila', 'Herrera', '9043 Paseo Imaginario', 'Doral', '33166', 2011],
  ['Javier', 'Salgado', '1550 Calle Ficticia Sur', 'Coral Gables', '33143', 1958],
  ['Isabel', 'Rey', '2207 Camino de la Brisa', 'Kendall', '33186', 1999],
  ['Marcos', 'Dávila', '480 Calle Coral Inventada', 'Homestead', '33030', 2006],
  ['Lucía', 'Fontana', '1015 Avenida del Sol', 'Miami Beach', '33139', 1967],
  ['Esteban', 'Lara', '6638 Calle Lago Azul', 'Pembroke Pines', '33027', 2002],
  ['Natalia', 'Pons', '3301 Paseo Marino', 'Hollywood', '33021', 1979],
  ['Héctor', 'Barrios', '845 Calle del Roble', 'Plantation', '33317', 1983],
  ['Paola', 'Cifuentes', '2790 Avenida Ejemplo', 'Fort Lauderdale', '33312', 1972],
  ['Rodrigo', 'Arce', '519 Camino Soleado', 'Boca Raton', '33432', 1994],
  ['Verónica', 'Luna', '1288 Calle Vista Alegre', 'Delray Beach', '33444', 1990],
  ['Tomás', 'Villalba', '4410 Paseo de los Pinos', 'West Palm Beach', '33401', 1976],
  ['Ximena', 'Cáceres', '905 Calle Gaviota', 'Boynton Beach', '33435', 2001],
  ['Gustavo', 'Ibarra', '7777 Avenida Muestra', 'Weston', '33326', 2009],
  ['Renata', 'Solís', '632 Calle Naranjo', 'Sunrise', '33322', 1987],
  ['Alberto', 'Montoya', '2154 Camino Real Ficticio', 'Coral Springs', '33065', 1996],
  ['Carolina', 'Bravo', '381 Calle Laguna', 'Palmetto Bay', '33157', 2004],
  ['Felipe', 'Ochoa', '1920 Avenida Cedro', 'Cutler Bay', '33189', 2013],
  ['Daniela', 'Quiroga', '66 Paseo del Faro', 'Aventura', '33180', 1981],
];

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// --- Presupuestos -----------------------------------------------------------------------------

type QuoteState = 'DRAFT' | 'SENT' | 'VIEWED' | 'DECLINED' | 'EXPIRED' | 'SUPERSEDED' | 'APPROVED';
type ProjectScenario = 'NEW' | 'ACTIVE_EARLY' | 'ACTIVE_LATE' | 'DONE';

interface QuoteSpec {
  customer: number | 'claraGables';
  state: QuoteState;
  daysAgo: number;
  packages: string[];
  area: number;
  pitch: number;
  ridge: number;
  eaves: number;
  discountBps?: number;
  scenario?: ProjectScenario;
  /** Días desde la aceptación hasta hoy (solo APPROVED). */
  acceptedDaysAgo?: number;
  rep: 0 | 1;
}

const P = {
  basicAsphalt: 'Básico · teja asfáltica',
  betterAsphalt: 'Mejor · teja asfáltica con membrana autoadhesiva',
  betterMetal: 'Mejor · panel metálico',
  premiumClay: 'Premium · teja de barro',
};

const QUOTE_SPECS: QuoteSpec[] = [
  // Proyectos terminados
  {
    customer: 0,
    state: 'APPROVED',
    scenario: 'DONE',
    daysAgo: 52,
    acceptedDaysAgo: 48,
    packages: [P.basicAsphalt, P.betterAsphalt],
    area: 2100,
    pitch: 5,
    ridge: 40,
    eaves: 140,
    rep: 0,
  },
  {
    customer: 1,
    state: 'APPROVED',
    scenario: 'DONE',
    daysAgo: 38,
    acceptedDaysAgo: 34,
    packages: [P.betterAsphalt, P.betterMetal],
    area: 1750,
    pitch: 6,
    ridge: 34,
    eaves: 120,
    rep: 1,
  },
  // Proyectos en curso
  {
    customer: 2,
    state: 'APPROVED',
    scenario: 'ACTIVE_LATE',
    daysAgo: 20,
    acceptedDaysAgo: 16,
    packages: [P.betterMetal, P.premiumClay],
    area: 2600,
    pitch: 7,
    ridge: 52,
    eaves: 170,
    rep: 0,
  },
  {
    customer: 3,
    state: 'APPROVED',
    scenario: 'ACTIVE_LATE',
    daysAgo: 15,
    acceptedDaysAgo: 11,
    packages: [P.premiumClay, P.betterAsphalt],
    area: 3100,
    pitch: 6,
    ridge: 60,
    eaves: 190,
    rep: 1,
  },
  {
    customer: 'claraGables',
    state: 'APPROVED',
    scenario: 'ACTIVE_EARLY',
    daysAgo: 10,
    acceptedDaysAgo: 6,
    packages: [P.betterAsphalt, P.betterMetal],
    area: 1500,
    pitch: 5,
    ridge: 30,
    eaves: 105,
    rep: 0,
  },
  // Recién aceptados
  {
    customer: 4,
    state: 'APPROVED',
    scenario: 'NEW',
    daysAgo: 4,
    acceptedDaysAgo: 2,
    packages: [P.basicAsphalt, P.betterAsphalt],
    area: 1900,
    pitch: 5,
    ridge: 38,
    eaves: 128,
    rep: 1,
  },
  {
    customer: 5,
    state: 'APPROVED',
    scenario: 'NEW',
    daysAgo: 3,
    acceptedDaysAgo: 1,
    packages: [P.betterMetal],
    area: 2300,
    pitch: 6,
    ridge: 46,
    eaves: 150,
    rep: 0,
  },
  // Resto de estados
  {
    customer: 6,
    state: 'SENT',
    daysAgo: 2,
    packages: [P.basicAsphalt, P.betterAsphalt, P.premiumClay],
    area: 2000,
    pitch: 5,
    ridge: 38,
    eaves: 132,
    rep: 0,
  },
  {
    customer: 7,
    state: 'SENT',
    daysAgo: 1,
    packages: [P.betterAsphalt, P.betterMetal],
    area: 2450,
    pitch: 6,
    ridge: 48,
    eaves: 160,
    discountBps: 300,
    rep: 1,
  },
  {
    customer: 8,
    state: 'VIEWED',
    daysAgo: 6,
    packages: [P.betterAsphalt, P.premiumClay],
    area: 1850,
    pitch: 6,
    ridge: 36,
    eaves: 125,
    rep: 0,
  },
  {
    customer: 9,
    state: 'DRAFT',
    daysAgo: 0,
    packages: [P.basicAsphalt, P.betterAsphalt],
    area: 1600,
    pitch: 4,
    ridge: 32,
    eaves: 112,
    rep: 1,
  },
  {
    customer: 10,
    state: 'DECLINED',
    daysAgo: 14,
    packages: [P.premiumClay],
    area: 2800,
    pitch: 7,
    ridge: 55,
    eaves: 175,
    rep: 0,
  },
  {
    customer: 11,
    state: 'EXPIRED',
    daysAgo: 45,
    packages: [P.basicAsphalt, P.betterMetal],
    area: 2050,
    pitch: 5,
    ridge: 40,
    eaves: 138,
    rep: 1,
  },
  {
    customer: 12,
    state: 'SUPERSEDED',
    daysAgo: 12,
    packages: [P.betterAsphalt, P.betterMetal],
    area: 2200,
    pitch: 6,
    ridge: 44,
    eaves: 148,
    rep: 0,
  },
];

interface SeedCtx {
  tx: Tx;
  storage: Storage | null;
  adminId: string;
  reps: string[];
  crew: { id: string; lead: boolean }[];
  packageIds: Map<string, string>;
  customerIds: string[];
  propertyIds: string[];
  clara: { customerId: string; gablesId: string };
  appointmentSlots: Map<string, { start: number; end: number }[]>;
  inspectorIds: string[];
}

async function sendVersion(
  ctx: SeedCtx,
  quote: { id: string; number: string },
  versionId: string,
  versionNumber: number,
  sentAt: Date,
  validUntil: Date,
): Promise<void> {
  const { tx, storage, adminId } = ctx;
  if (!storage) throw new Error('Sin almacenamiento no se pueden enviar presupuestos');
  const full = await tx.quoteVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: {
      options: {
        orderBy: { sortOrder: 'asc' },
        include: { lines: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  });
  const fullQuote = await tx.quote.findUniqueOrThrow({
    where: { id: quote.id },
    include: { customer: true, property: true },
  });
  const pdf = await renderQuotePdf(toPdfData(fullQuote, full, sentAt, validUntil));
  const sha256 = createHash('sha256').update(pdf).digest('hex');
  const objectKey = `quotes/${quote.id}/${randomUUID()}.pdf`;
  await storage.put({
    key: objectKey,
    body: pdf,
    contentType: 'application/pdf',
    sha256Hex: sha256,
  });
  const file = await tx.file.create({
    data: {
      bucket: storage.bucket,
      objectKey,
      mimeType: 'application/pdf',
      sizeBytes: BigInt(pdf.length),
      sha256,
      originalName: `${quote.number}-v${versionNumber}.pdf`,
      uploadedById: adminId,
      status: 'READY',
    },
  });
  await tx.quoteVersion.update({
    where: { id: versionId },
    data: {
      status: 'SENT',
      sentAt,
      sentById: adminId,
      lockedAt: sentAt,
      validUntil,
      pdfFileId: file.id,
      pdfSha256: sha256,
    },
  });
}

async function createQuote(ctx: SeedCtx, spec: QuoteSpec): Promise<BuiltQuote | null> {
  const { tx, adminId } = ctx;
  const customerId =
    spec.customer === 'claraGables' ? ctx.clara.customerId : ctx.customerIds[spec.customer]!;
  const propertyId =
    spec.customer === 'claraGables' ? ctx.clara.gablesId : ctx.propertyIds[spec.customer]!;
  if (spec.state !== 'DRAFT' && !ctx.storage) return null;

  const measurements = {
    sections: [
      {
        name: 'Techo principal',
        areaSqFt: spec.area,
        areaKind: 'PLAN' as const,
        pitchRise: spec.pitch,
      },
    ],
    ridgeFt: spec.ridge,
    eavesFt: spec.eaves,
    hipsFt: 0,
    valleysFt: 0,
    guttersFt: 0,
  };
  const parameters = {
    wasteBps: 1000,
    taxBps: 700,
    taxAppliesToLabor: false,
    discountBps: spec.discountBps ?? 0,
    depositBps: 5000,
  };
  const packageIds = spec.packages.map((name) => {
    const id = ctx.packageIds.get(name);
    if (!id) throw new Error(`Falta el paquete demo «${name}»`);
    return id;
  });
  const calculation = await calculateForPackages(tx, packageIds, measurements, parameters);
  const sentAt = ago(spec.daysAgo);
  const quote = await tx.quote.create({
    data: {
      customerId,
      propertyId,
      salesRepId: ctx.reps[spec.rep] ?? null,
      createdById: adminId,
      createdAt: new Date(sentAt.getTime() - DAY),
    },
  });
  const version = await tx.quoteVersion.create({
    data: {
      quoteId: quote.id,
      versionNumber: 1,
      locale: 'es',
      ...parameters,
      measurementsSnapshot: snapshotOf(measurements),
      notes: 'Presupuesto de demostración con precios ficticios.',
      createdById: adminId,
    },
  });
  await storeOptions(tx, version.id, calculation);
  if (spec.state === 'DRAFT') return {};

  const validUntil = new Date(sentAt.getTime() + 30 * DAY);
  await sendVersion(ctx, quote, version.id, 1, sentAt, validUntil);
  await tx.quote.update({ where: { id: quote.id }, data: { firstSentAt: sentAt } });

  const patch = (data: Record<string, unknown>) =>
    tx.quoteVersion.update({ where: { id: version.id }, data });
  switch (spec.state) {
    case 'VIEWED':
      await patch({ status: 'VIEWED', viewedAt: new Date(sentAt.getTime() + HOUR) });
      break;
    case 'DECLINED':
      await patch({ status: 'VIEWED', viewedAt: new Date(sentAt.getTime() + HOUR) });
      await patch({
        status: 'DECLINED',
        declinedAt: new Date(sentAt.getTime() + 2 * DAY),
        declineReason: 'Prefiere esperar a la próxima temporada (demostración).',
      });
      break;
    case 'EXPIRED':
      await patch({ status: 'EXPIRED', expiredAt: validUntil });
      break;
    case 'SUPERSEDED': {
      await patch({ status: 'SUPERSEDED', supersededAt: new Date(sentAt.getTime() + 2 * DAY) });
      const revised = { ...parameters, discountBps: 500 };
      const second = await tx.quoteVersion.create({
        data: {
          quoteId: quote.id,
          versionNumber: 2,
          locale: 'es',
          ...revised,
          measurementsSnapshot: snapshotOf(measurements),
          notes: 'Revisión con descuento de demostración.',
          createdById: adminId,
        },
      });
      await storeOptions(
        tx,
        second.id,
        await calculateForPackages(tx, packageIds, measurements, revised),
      );
      const secondSent = new Date(sentAt.getTime() + 2 * DAY);
      await sendVersion(
        ctx,
        quote,
        second.id,
        2,
        secondSent,
        new Date(secondSent.getTime() + 30 * DAY),
      );
      break;
    }
    case 'APPROVED': {
      const acceptedAt = ago(spec.acceptedDaysAgo ?? 1);
      await patch({ status: 'VIEWED', viewedAt: new Date(sentAt.getTime() + HOUR) });
      const option = await tx.quoteOption.findFirstOrThrow({
        where: { versionId: version.id },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, title: true, totalCents: true, depositCents: true, balanceCents: true },
      });
      await patch({ status: 'APPROVED', approvedAt: acceptedAt, approvedOptionId: option.id });
      const property = await tx.property.findUniqueOrThrow({
        where: { id: propertyId },
        select: { addressLine1: true, city: true },
      });
      const scheduleOffset: Record<ProjectScenario, number> = {
        NEW: 10,
        ACTIVE_EARLY: -4,
        ACTIVE_LATE: -7,
        DONE: -((spec.acceptedDaysAgo ?? 30) - 14),
      };
      const startsAt = ago(-scheduleOffset[spec.scenario ?? 'NEW']);
      const project = await projectFromApproval(tx, {
        quoteId: quote.id,
        versionId: version.id,
        customerId,
        propertyId,
        address: `${property.addressLine1}, ${property.city}`,
        option,
        now: acceptedAt,
        startsAt,
      });
      return { project, startsAt };
    }
    default:
      break;
  }
  return {};
}

// --- Proyectos: etapas, cuadrilla, fotos y pagos simulados -----------------------------------

async function uploadPhoto(
  ctx: SeedCtx,
  projectId: string,
  stageId: string | null,
  phase: DemoPhase,
  variant: number,
  caption: string,
  takenAt: Date,
  takenById: string | null,
): Promise<void> {
  const { tx, storage, adminId } = ctx;
  if (!storage) return;
  const { body, name } = demoPhoto(phase, variant);
  const sha256 = createHash('sha256').update(body).digest('hex');
  const objectKey = `projects/${projectId}/${randomUUID()}.jpg`;
  await storage.put({ key: objectKey, body, contentType: 'image/jpeg', sha256Hex: sha256 });
  const file = await tx.file.create({
    data: {
      bucket: storage.bucket,
      objectKey,
      mimeType: 'image/jpeg',
      sizeBytes: BigInt(body.length),
      sha256,
      originalName: name,
      uploadedById: adminId,
      status: 'READY',
    },
  });
  await tx.projectPhoto.create({
    data: { projectId, stageId, fileId: file.id, phase, caption, takenAt, takenById },
  });
}

async function advanceProject(
  ctx: SeedCtx,
  built: { project: { id: string }; startsAt: Date },
  scenario: ProjectScenario,
  index: number,
): Promise<void> {
  const { tx } = ctx;
  const projectId = built.project.id;
  const stages = await tx.projectStage.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
  });
  // Cuántas etapas están hechas y cuál está en curso.
  const done: Record<ProjectScenario, number> = {
    NEW: 0,
    ACTIVE_EARLY: 2,
    ACTIVE_LATE: 3,
    DONE: 5,
  };
  const doneCount = done[scenario];
  const stageDate = (i: number) => new Date(built.startsAt.getTime() + i * DAY);
  for (const [i, stage] of stages.entries()) {
    if (i < doneCount) {
      await tx.projectStage.update({
        where: { id: stage.id },
        data: { status: 'DONE', startedAt: stageDate(i), completedAt: stageDate(i + 1) },
      });
    } else if (i === doneCount && scenario !== 'NEW' && scenario !== 'DONE') {
      await tx.projectStage.update({
        where: { id: stage.id },
        data: { status: 'IN_PROGRESS', startedAt: stageDate(i) },
      });
    }
  }
  if (scenario !== 'NEW') {
    await tx.project.update({
      where: { id: projectId },
      data: {
        status: scenario === 'DONE' ? 'COMPLETED' : 'IN_PROGRESS',
        actualStart: built.startsAt,
        ...(scenario === 'DONE' ? { actualEnd: stageDate(5) } : {}),
      },
    });
  }

  // Cuadrilla: un jefe y, a veces, un segundo integrante. Emilio (demo) en los primeros proyectos.
  const lead = ctx.crew.filter((c) => c.lead)[index % ctx.crew.filter((c) => c.lead).length]!;
  const members = ctx.crew.filter((c) => c.id !== lead.id);
  const assigned: { id: string; role: 'CREW_LEAD' | 'CREW_MEMBER' }[] = [
    { id: lead.id, role: 'CREW_LEAD' },
  ];
  const second = members[(index + 1) % members.length];
  if (second) assigned.push({ id: second.id, role: 'CREW_MEMBER' as const });
  for (const person of assigned) {
    await tx.projectAssignment.create({
      data: { projectId, employeeId: person.id, role: person.role },
    });
  }

  // Fotos
  const takenBy = lead.id;
  if (scenario !== 'NEW') {
    await uploadPhoto(
      ctx,
      projectId,
      stages[0]!.id,
      'BEFORE',
      index,
      'Estado del techo antes de empezar',
      built.startsAt,
      takenBy,
    );
    await uploadPhoto(
      ctx,
      projectId,
      stages[0]!.id,
      'BEFORE',
      index + 1,
      'Daños en la cara sur',
      built.startsAt,
      takenBy,
    );
  }
  if (scenario === 'ACTIVE_LATE' || scenario === 'DONE') {
    await uploadPhoto(
      ctx,
      projectId,
      stages[3]!.id,
      'DURING',
      index,
      'Instalación en curso',
      stageDate(3),
      takenBy,
    );
  }
  if (scenario === 'DONE') {
    await uploadPhoto(
      ctx,
      projectId,
      stages[4]!.id,
      'AFTER',
      index,
      'Techo terminado',
      stageDate(5),
      takenBy,
    );
    await uploadPhoto(
      ctx,
      projectId,
      stages[4]!.id,
      'AFTER',
      index + 1,
      'Vista final de la propiedad',
      stageDate(5),
      takenBy,
    );
  }

  // Facturas y pagos SIMULADOS (solo registros: no hay cobros reales).
  const invoices = await tx.invoice.findMany({ where: { projectId }, orderBy: { kind: 'asc' } });
  for (const invoice of invoices) {
    const shouldBePaid =
      invoice.kind === 'DEPOSIT' ? scenario !== 'NEW' || index % 2 === 0 : scenario === 'DONE';
    if (!shouldBePaid) continue;
    const paidAt = new Date(
      Math.min(
        Date.now(),
        invoice.issuedAt.getTime() + (invoice.kind === 'DEPOSIT' ? 2 : 14) * DAY,
      ),
    );
    await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'PAID', paidAt } });
    await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amountCents: invoice.totalCents,
        paidAt,
        recordedById: ctx.adminId,
      },
    });
  }
}

// --- CRM: leads, citas e inspecciones --------------------------------------------------------

function reserve(ctx: SeedCtx, assigneeId: string, start: Date): Date {
  const slots = ctx.appointmentSlots.get(assigneeId) ?? [];
  let candidate = start.getTime();
  // Sin solapes con las citas ya reservadas (también con 30 min de margen).
  for (;;) {
    const clash = slots.find(
      (s) => candidate < s.end + 1_800_000 && candidate + HOUR > s.start - 1_800_000,
    );
    if (!clash) break;
    candidate = clash.end + 1_800_000;
  }
  slots.push({ start: candidate, end: candidate + HOUR });
  ctx.appointmentSlots.set(assigneeId, slots);
  return new Date(candidate);
}

/** Lunes 00:00 (hora local) de la semana de hoy. */
function mondayOfThisWeek(): Date {
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

export async function seedDemoRich(db: Db): Promise<void> {
  if (await db.customerProfile.findFirst({ where: { email: MARKER_EMAIL } })) {
    console.log('Los datos del seed demo rico ya existen; no se modifican.');
    return;
  }
  const admin = await db.user.findFirst({
    where: { role: { in: ['ADMIN', 'SUPERADMIN'] }, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  const emilio = await db.employeeProfile.findFirst({
    where: { user: { email: 'empleado@cresta-roofing.example' } },
  });
  const clara = await db.customerProfile.findFirst({
    where: { email: 'cliente@cresta-roofing.example' },
    include: { properties: true },
  });
  const packages = await db.package.findMany({ select: { id: true, name: true } });
  const gables = clara?.properties.find((p) => p.addressLine1 === '88 Plaza Ficticia');
  if (!admin || !emilio || !clara || !gables || packages.length === 0) {
    console.log('Faltan datos base (usuarios, CRM o catálogo); se omite el seed demo rico.');
    return;
  }
  const storage = seedStorage();
  if (!storage) console.log('Sin almacenamiento S3: se omiten PDF y fotos de la demo rica.');

  await db.$transaction(
    async (tx) => {
      // 1. Empleados adicionales (sin contraseña: no inician sesión; sirven de cuadrilla y ventas).
      const employees: Record<string, string> = {};
      for (const person of EXTRA_EMPLOYEES) {
        const id = randomUUID();
        await tx.user.create({
          data: {
            id,
            name: person.name,
            email: person.email,
            emailVerified: true,
            role: 'EMPLOYEE',
            employeeProfile: {
              create: {
                jobTypes: [...person.jobs],
                phone: `+130555501${String(10 + EXTRA_EMPLOYEES.indexOf(person)).padStart(2, '0')}`,
              },
            },
          },
        });
        const profile = await tx.employeeProfile.findUniqueOrThrow({ where: { userId: id } });
        employees[person.name] = profile.id;
      }
      const gabriela = employees['Gabriela Ortiz']!;
      const crew = [
        { id: employees['Rafael Quintero']!, lead: true },
        { id: employees['Mateo Salazar']!, lead: true },
        { id: employees['Diego Rojas']!, lead: true },
        { id: emilio.id, lead: false },
      ];

      // 2. Clientes y propiedades
      const customerIds: string[] = [];
      const propertyIds: string[] = [];
      for (const [i, [first, last, street, city, zip, year]] of CUSTOMERS.entries()) {
        const customer = await tx.customerProfile.create({
          data: {
            firstName: first,
            lastName: last,
            email: `${plain(first)}.${plain(last)}@demo-clientes.example`,
            phone: `+1305555${String(105 + i).padStart(4, '0')}`,
            preferredContact: (['EMAIL', 'PHONE', 'SMS'] as const)[i % 3]!,
            createdAt: ago(60 - i * 2),
          },
        });
        const property = await tx.property.create({
          data: {
            customerId: customer.id,
            addressLine1: street,
            city,
            state: 'FL',
            zip,
            yearBuilt: year,
          },
        });
        customerIds.push(customer.id);
        propertyIds.push(property.id);
      }

      const packageIds = new Map(packages.map((p) => [p.name, p.id]));
      const existingAppointments = await tx.appointment.findMany({
        where: { status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] } },
        select: { assigneeId: true, startsAt: true, endsAt: true },
      });
      const appointmentSlots = new Map<string, { start: number; end: number }[]>();
      for (const a of existingAppointments) {
        const list = appointmentSlots.get(a.assigneeId) ?? [];
        list.push({ start: a.startsAt.getTime(), end: a.endsAt.getTime() });
        appointmentSlots.set(a.assigneeId, list);
      }
      const ctx: SeedCtx = {
        tx,
        storage,
        adminId: admin.id,
        reps: [emilio.id, gabriela],
        crew,
        packageIds,
        customerIds,
        propertyIds,
        clara: { customerId: clara.id, gablesId: gables.id },
        appointmentSlots,
        inspectorIds: [emilio.id, gabriela, employees['Iván Peña']!],
      };

      // 3. Presupuestos en todos los estados y proyectos
      let projectIndex = 0;
      const projectCustomers: number[] = [];
      for (const spec of QUOTE_SPECS) {
        const built = await createQuote(ctx, spec);
        if (built?.project && built.startsAt && spec.scenario) {
          await advanceProject(
            ctx,
            { project: built.project, startsAt: built.startsAt },
            spec.scenario,
            projectIndex++,
          );
          if (typeof spec.customer === 'number') projectCustomers.push(spec.customer);
        }
      }
      // El cliente demo y el empleado demo ven datos en sus pantallas:
      // Emilio queda asignado a los dos proyectos en curso más recientes.
      const active = await tx.project.findMany({
        where: { status: 'IN_PROGRESS' },
        orderBy: { acceptedAt: 'desc' },
        take: 2,
        select: { id: true },
      });
      for (const project of active) {
        await tx.projectAssignment.upsert({
          where: { projectId_employeeId: { projectId: project.id, employeeId: emilio.id } },
          create: { projectId: project.id, employeeId: emilio.id, role: 'CREW_MEMBER' },
          update: {},
        });
      }

      // 4. Citas: esta semana y la siguiente, y algunas pasadas, con inspecciones
      const monday = mondayOfThisWeek();
      const slot = (dayOffset: number, hour: number) => {
        const d = new Date(monday);
        d.setDate(d.getDate() + dayOffset);
        d.setHours(hour, 0, 0, 0);
        return d;
      };
      const todayOffset = Math.floor((Date.now() - monday.getTime()) / DAY);
      const staff = [emilio.id, gabriela, employees['Iván Peña']!];
      const planned: {
        customer: number;
        day: number;
        hour: number;
        who: number;
        type: 'INSPECTION' | 'FOLLOW_UP' | 'ESTIMATE_PRESENTATION';
        notes?: string;
      }[] = [
        { customer: 13, day: 0, hour: 9, who: 0, type: 'INSPECTION' },
        { customer: 14, day: 0, hour: 11, who: 1, type: 'INSPECTION' },
        {
          customer: 15,
          day: 1,
          hour: 10,
          who: 2,
          type: 'INSPECTION',
          notes: 'Posible daño por la última tormenta.',
        },
        { customer: 16, day: 1, hour: 14, who: 0, type: 'FOLLOW_UP' },
        { customer: 17, day: 2, hour: 9, who: 1, type: 'INSPECTION' },
        { customer: 18, day: 2, hour: 13, who: 0, type: 'ESTIMATE_PRESENTATION' },
        { customer: 19, day: 3, hour: 10, who: 2, type: 'INSPECTION' },
        { customer: 20, day: 3, hour: 15, who: 1, type: 'FOLLOW_UP' },
        { customer: 13, day: 4, hour: 11, who: 0, type: 'INSPECTION' },
        { customer: 14, day: 4, hour: 16, who: 2, type: 'ESTIMATE_PRESENTATION' },
        { customer: 15, day: 5, hour: 10, who: 1, type: 'INSPECTION' },
        // Semana siguiente
        { customer: 16, day: 7, hour: 9, who: 0, type: 'INSPECTION' },
        { customer: 17, day: 7, hour: 13, who: 1, type: 'INSPECTION' },
        { customer: 18, day: 8, hour: 10, who: 2, type: 'INSPECTION' },
        { customer: 19, day: 8, hour: 15, who: 0, type: 'FOLLOW_UP' },
        { customer: 20, day: 9, hour: 11, who: 1, type: 'ESTIMATE_PRESENTATION' },
        { customer: 6, day: 10, hour: 10, who: 0, type: 'ESTIMATE_PRESENTATION' },
        { customer: 7, day: 10, hour: 14, who: 2, type: 'FOLLOW_UP' },
        { customer: 8, day: 11, hour: 9, who: 1, type: 'INSPECTION' },
        { customer: 9, day: 12, hour: 10, who: 0, type: 'INSPECTION' },
      ];
      const inspectionTargets: {
        id: string;
        propertyId: string;
        assigneeId: string;
        startsAt: Date;
        draft: boolean;
      }[] = [];
      for (const item of planned) {
        const assigneeId = staff[item.who]!;
        const desired = slot(item.day, item.hour);
        const startsAt = reserve(ctx, assigneeId, desired);
        const past = startsAt.getTime() < Date.now() - HOUR;
        const today = item.day === todayOffset;
        const status = past
          ? item.day % 5 === 4
            ? 'NO_SHOW'
            : 'COMPLETED'
          : today && startsAt.getTime() <= Date.now()
            ? 'IN_PROGRESS'
            : item.day % 2 === 0
              ? 'CONFIRMED'
              : 'SCHEDULED';
        const appointment = await tx.appointment.create({
          data: {
            customerId: customerIds[item.customer]!,
            propertyId: propertyIds[item.customer]!,
            assigneeId,
            type: item.type,
            startsAt,
            endsAt: new Date(startsAt.getTime() + HOUR),
            status,
            ...(item.notes ? { notes: item.notes } : {}),
          },
        });
        if (item.type === 'INSPECTION' && (status === 'COMPLETED' || status === 'IN_PROGRESS')) {
          inspectionTargets.push({
            id: appointment.id,
            propertyId: appointment.propertyId,
            assigneeId,
            startsAt,
            draft: status === 'IN_PROGRESS',
          });
        }
      }
      // Citas pasadas de los clientes con proyecto (historial)
      for (const [n, c] of projectCustomers.entries()) {
        const assigneeId = staff[n % 3]!;
        const startsAt = reserve(ctx, assigneeId, new Date(ago(60 - n * 3).setHours(10, 0, 0, 0)));
        const appointment = await tx.appointment.create({
          data: {
            customerId: customerIds[c]!,
            propertyId: propertyIds[c]!,
            assigneeId,
            type: 'INSPECTION',
            startsAt,
            endsAt: new Date(startsAt.getTime() + HOUR),
            status: 'COMPLETED',
            notes: 'Inspección previa al presupuesto.',
          },
        });
        inspectionTargets.push({
          id: appointment.id,
          propertyId: appointment.propertyId,
          assigneeId,
          startsAt,
          draft: false,
        });
      }
      // Citas próximas del cliente demo: así su portal tiene agenda al entrar.
      const claraDoral = clara.properties.find(
        (p) => p.addressLine1 === '1420 Calle de Ejemplo Norte',
      );
      if (claraDoral) {
        for (const [dayOffset, hour, type, status] of [
          [todayOffset + 2, 10, 'ESTIMATE_PRESENTATION', 'CONFIRMED'],
          [todayOffset + 6, 14, 'FOLLOW_UP', 'SCHEDULED'],
        ] as const) {
          const startsAt = reserve(ctx, emilio.id, slot(dayOffset, hour));
          await tx.appointment.create({
            data: {
              customerId: clara.id,
              propertyId: claraDoral.id,
              assigneeId: emilio.id,
              type,
              startsAt,
              endsAt: new Date(startsAt.getTime() + HOUR),
              status,
            },
          });
        }
      }
      const findings = [
        'Tejas levantadas en los bordes y sellado desgastado en las ventilaciones.',
        'Granulado perdido en la cara sur; sin filtraciones visibles.',
        'Manchas de humedad en el entretecho junto a la chimenea.',
        'Techo en buen estado general; recomendable reemplazo preventivo en 2 años.',
      ];
      for (const [n, target] of inspectionTargets.entries()) {
        const inspection = await tx.inspection.create({
          data: {
            appointmentId: target.id,
            propertyId: target.propertyId,
            inspectorId: target.assigneeId,
            status: target.draft ? 'DRAFT' : 'COMPLETED',
            ...(target.draft
              ? {}
              : { completedAt: new Date(target.startsAt.getTime() + 2 * HOUR) }),
            roofType: (['ASPHALT_SHINGLE', 'CLAY_TILE', 'METAL', 'CONCRETE_TILE'] as const)[n % 4]!,
            roofAgeYears: 8 + ((n * 3) % 15),
            findings: findings[n % findings.length]!,
          },
        });
        await tx.inspectionSection.createMany({
          data: [
            {
              name: 'Faldón principal',
              areaSqft: String(900 + n * 40),
              pitchRise: '6',
              ridgeFt: '30',
              eaveFt: '40',
              sortOrder: 1,
            },
            {
              name: 'Faldón secundario',
              areaSqft: String(700 + n * 25),
              pitchRise: '5',
              ridgeFt: '26',
              eaveFt: '34',
              sortOrder: 2,
            },
          ].map((section) => ({ inspectionId: inspection.id, ...section })),
        });
      }

      // 5. Leads en todos los estados
      type LeadStatus =
        | 'NEW'
        | 'CONTACTED'
        | 'APPOINTMENT_SET'
        | 'INSPECTED'
        | 'QUOTED'
        | 'WON'
        | 'LOST'
        | 'SPAM'
        | 'DUPLICATE';
      const leadRows: {
        status: LeadStatus;
        source: 'WEB_FORM' | 'PHONE' | 'REFERRAL' | 'DOOR_KNOCK' | 'OTHER';
        first: string;
        last: string;
        city: string;
        zip: string;
        message?: string;
        daysAgo: number;
        customer?: number;
        rep?: number;
        lostReason?: string;
      }[] = [
        {
          status: 'NEW',
          source: 'WEB_FORM',
          first: 'Ricardo',
          last: 'Almeida',
          city: 'Miami',
          zip: '33142',
          message: 'Se cayeron varias tejas con el viento de ayer.',
          daysAgo: 0,
          rep: 0,
        },
        {
          status: 'NEW',
          source: 'WEB_FORM',
          first: 'Beatriz',
          last: 'Nava',
          city: 'Doral',
          zip: '33178',
          message: 'Necesito una cotización para techo de metal.',
          daysAgo: 0,
        },
        {
          status: 'NEW',
          source: 'PHONE',
          first: 'Óscar',
          last: 'Treviño',
          city: 'Hialeah',
          zip: '33012',
          daysAgo: 1,
          rep: 0,
        },
        {
          status: 'NEW',
          source: 'REFERRAL',
          first: 'Mónica',
          last: 'Gil',
          city: 'Kendall',
          zip: '33176',
          message: 'Me lo recomendó una vecina.',
          daysAgo: 2,
        },
        {
          status: 'CONTACTED',
          source: 'WEB_FORM',
          first: 'Sebastián',
          last: 'Reyes',
          city: 'Hollywood',
          zip: '33020',
          daysAgo: 4,
          rep: 0,
        },
        {
          status: 'CONTACTED',
          source: 'PHONE',
          first: 'Adriana',
          last: 'Campos',
          city: 'Pembroke Pines',
          zip: '33024',
          daysAgo: 5,
          rep: 1,
        },
        {
          status: 'APPOINTMENT_SET',
          source: 'WEB_FORM',
          first: 'Valentina',
          last: 'Mora',
          city: 'Miami',
          zip: '33173',
          daysAgo: 7,
          customer: 0,
          rep: 0,
        },
        {
          status: 'APPOINTMENT_SET',
          source: 'DOOR_KNOCK',
          first: 'Camila',
          last: 'Herrera',
          city: 'Doral',
          zip: '33166',
          daysAgo: 6,
          customer: 2,
          rep: 1,
        },
        {
          status: 'INSPECTED',
          source: 'WEB_FORM',
          first: 'Natalia',
          last: 'Pons',
          city: 'Hollywood',
          zip: '33021',
          daysAgo: 9,
          customer: 8,
          rep: 0,
        },
        {
          status: 'QUOTED',
          source: 'REFERRAL',
          first: 'Lucía',
          last: 'Fontana',
          city: 'Miami Beach',
          zip: '33139',
          daysAgo: 8,
          customer: 6,
          rep: 1,
        },
        {
          status: 'QUOTED',
          source: 'WEB_FORM',
          first: 'Esteban',
          last: 'Lara',
          city: 'Pembroke Pines',
          zip: '33027',
          daysAgo: 3,
          customer: 7,
          rep: 0,
        },
        {
          status: 'WON',
          source: 'WEB_FORM',
          first: 'Valentina',
          last: 'Mora',
          city: 'Miami',
          zip: '33173',
          daysAgo: 55,
          customer: 0,
          rep: 0,
        },
        {
          status: 'WON',
          source: 'PHONE',
          first: 'Andrés',
          last: 'Paredes',
          city: 'Hialeah',
          zip: '33015',
          daysAgo: 42,
          customer: 1,
          rep: 1,
        },
        {
          status: 'WON',
          source: 'REFERRAL',
          first: 'Javier',
          last: 'Salgado',
          city: 'Coral Gables',
          zip: '33143',
          daysAgo: 22,
          customer: 3,
          rep: 1,
        },
        {
          status: 'LOST',
          source: 'WEB_FORM',
          first: 'Paola',
          last: 'Cifuentes',
          city: 'Fort Lauderdale',
          zip: '33312',
          daysAgo: 16,
          customer: 10,
          lostReason: 'Decidió esperar al próximo año',
        },
        {
          status: 'LOST',
          source: 'PHONE',
          first: 'Marcos',
          last: 'Pardo',
          city: 'Homestead',
          zip: '33033',
          daysAgo: 30,
          lostReason: 'No respondió a las llamadas',
        },
        {
          status: 'DUPLICATE',
          source: 'WEB_FORM',
          first: 'Beatriz',
          last: 'Nava',
          city: 'Doral',
          zip: '33178',
          daysAgo: 0,
        },
        {
          status: 'SPAM',
          source: 'WEB_FORM',
          first: 'Ofertas',
          last: 'Rápidas',
          city: 'Miami',
          zip: '33101',
          message: 'Gane dinero desde casa, haga clic aquí.',
          daysAgo: 2,
        },
      ];
      for (const [n, lead] of leadRows.entries()) {
        const rep = lead.rep === undefined ? undefined : ctx.reps[lead.rep];
        await tx.lead.create({
          data: {
            status: lead.status,
            source: lead.source,
            firstName: lead.first,
            lastName: lead.last,
            email: `${plain(lead.first)}.${plain(lead.last)}@demo-leads.example`,
            phone: `+1305555${String(170 + n).padStart(4, '0')}`,
            city: lead.city,
            state: 'FL',
            zip: lead.zip,
            ...(lead.message ? { message: lead.message } : {}),
            ...(rep ? { assignedToId: rep } : {}),
            ...(lead.customer !== undefined
              ? { customerId: customerIds[lead.customer]!, propertyId: propertyIds[lead.customer]! }
              : {}),
            ...(lead.lostReason ? { lostReason: lead.lostReason } : {}),
            ...(lead.status === 'SPAM' ? { spamReason: 'honeypot' } : {}),
            createdAt: ago(lead.daysAgo, n % 7),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'seed.demo_rich',
          entityType: 'seed',
          after: {
            customers: customerIds.length,
            quotes: QUOTE_SPECS.length,
            leads: leadRows.length,
          },
        },
      });
    },
    { timeout: 600_000, maxWait: 30_000 },
  );
  console.log(
    'Seed demo rico creado (clientes, citas, presupuestos, proyectos, facturas simuladas).',
  );
}
