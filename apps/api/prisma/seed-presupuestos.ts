/**
 * Datos de demostración de catálogo y presupuestos (solo con SEED_DEMO=true): categorías,
 * artículos con precios FICTICIOS de demostración (no son precios reales de ningún proveedor),
 * colores, paquetes por nivel y cuatro presupuestos sobre clientes y propiedades demo del CRM
 * (borrador, enviado, visto y rechazado). Los enviados necesitan el almacenamiento S3 (Garage)
 * para guardar su PDF: sin él solo se crea el borrador. Idempotente: si ya existe la categoría
 * marcada, no hace nada.
 */
import { createHash, randomUUID } from 'node:crypto';
import { calculateForPackages, snapshotOf, storeOptions } from '../src/domain/quote-calc.js';
import { toPdfData } from '../src/domain/quote-pdf-data.js';
import type { Env } from '../src/env.js';
import type { createDb } from '../src/lib/db.js';
import { renderQuotePdf } from '../src/pdf/quote-pdf.js';
import { createS3Storage, type Storage } from '../src/lib/storage.js';

type Db = ReturnType<typeof createDb>;

const DAY = 86_400_000;
const MARKER_CATEGORY = 'Tejas asfálticas (demo)';
const DEMO_NOTE = 'Precio ficticio de demostración.';

interface DemoItem {
  key: string;
  name: string;
  sku: string;
  kind: 'MATERIAL' | 'LABOR';
  unit: 'SQUARE' | 'LINEAR_FT' | 'UNIT' | 'BUNDLE';
  category: string;
  material?: number;
  labor?: number;
  /** Unidad de compra: cuántas unidades base trae cada una. */
  purchase?: { name: string; base: number };
  colors?: { name: string; hex: string }[];
}

const CAT_ASPHALT = MARKER_CATEGORY;
const CAT_CLAY = 'Teja de barro y concreto (demo)';
const CAT_METAL = 'Metal (demo)';
const CAT_ACCESSORIES = 'Membranas y accesorios (demo)';
const CAT_LABOR = 'Instalación y servicios (demo)';

const CATEGORIES = [
  { name: CAT_ASPHALT, kind: 'MATERIAL' as const },
  { name: CAT_CLAY, kind: 'MATERIAL' as const },
  { name: CAT_METAL, kind: 'MATERIAL' as const },
  { name: CAT_ACCESSORIES, kind: 'MATERIAL' as const },
  { name: CAT_LABOR, kind: 'LABOR' as const },
];

const ITEMS: DemoItem[] = [
  {
    key: 'asphalt',
    name: 'Teja asfáltica arquitectónica',
    sku: 'DEMO-TEJ-ASF',
    kind: 'MATERIAL',
    unit: 'SQUARE',
    category: CAT_ASPHALT,
    material: 14500,
    purchase: { name: 'paquete', base: 0.333 },
    colors: [
      { name: 'Gris pizarra', hex: '#4A5560' },
      { name: 'Marrón madera', hex: '#5C4332' },
      { name: 'Negro carbón', hex: '#23262B' },
    ],
  },
  {
    key: 'clay',
    name: 'Teja de barro (media caña)',
    sku: 'DEMO-TEJ-BAR',
    kind: 'MATERIAL',
    unit: 'SQUARE',
    category: CAT_CLAY,
    material: 52000,
    purchase: { name: 'pallet', base: 2 },
    colors: [
      { name: 'Terracota', hex: '#B5532F' },
      { name: 'Arena', hex: '#D9B78A' },
    ],
  },
  {
    key: 'metal',
    name: 'Panel metálico de junta alzada',
    sku: 'DEMO-MET-PAN',
    kind: 'MATERIAL',
    unit: 'SQUARE',
    category: CAT_METAL,
    material: 38000,
    colors: [
      { name: 'Blanco', hex: '#F2F2EF' },
      { name: 'Gris grafito', hex: '#3E444B' },
    ],
  },
  {
    key: 'underlay',
    name: 'Membrana base autoadhesiva',
    sku: 'DEMO-MEM-AUT',
    kind: 'MATERIAL',
    unit: 'SQUARE',
    category: CAT_ACCESSORIES,
    material: 6500,
    purchase: { name: 'rollo', base: 2 },
  },
  {
    key: 'synthetic',
    name: 'Fieltro sintético',
    sku: 'DEMO-FIE-SIN',
    kind: 'MATERIAL',
    unit: 'SQUARE',
    category: CAT_ACCESSORIES,
    material: 1800,
    purchase: { name: 'rollo', base: 10 },
  },
  {
    key: 'ridge',
    name: 'Cumbrera',
    sku: 'DEMO-CUM-001',
    kind: 'MATERIAL',
    unit: 'LINEAR_FT',
    category: CAT_ACCESSORIES,
    material: 450,
    purchase: { name: 'caja', base: 25 },
  },
  {
    key: 'drip',
    name: 'Borde de goteo',
    sku: 'DEMO-GOT-001',
    kind: 'MATERIAL',
    unit: 'LINEAR_FT',
    category: CAT_ACCESSORIES,
    material: 250,
    purchase: { name: 'tira', base: 10 },
  },
  {
    key: 'tear',
    name: 'Retiro del techo existente',
    sku: 'DEMO-RET-001',
    kind: 'LABOR',
    unit: 'SQUARE',
    category: CAT_LABOR,
    labor: 4500,
  },
  {
    key: 'installAsphalt',
    name: 'Instalación de teja asfáltica',
    sku: 'DEMO-INS-ASF',
    kind: 'LABOR',
    unit: 'SQUARE',
    category: CAT_LABOR,
    labor: 7500,
  },
  {
    key: 'installClay',
    name: 'Instalación de teja de barro',
    sku: 'DEMO-INS-BAR',
    kind: 'LABOR',
    unit: 'SQUARE',
    category: CAT_LABOR,
    labor: 21000,
  },
  {
    key: 'installMetal',
    name: 'Instalación de panel metálico',
    sku: 'DEMO-INS-MET',
    kind: 'LABOR',
    unit: 'SQUARE',
    category: CAT_LABOR,
    labor: 16000,
  },
  {
    key: 'permit',
    name: 'Permisos e inspección municipal',
    sku: 'DEMO-PER-001',
    kind: 'LABOR',
    unit: 'UNIT',
    category: CAT_LABOR,
    labor: 45000,
  },
];

type Rule = 'PER_SQUARE' | 'PER_LINEAR_FT_RIDGE' | 'PER_LINEAR_FT_EAVE' | 'FIXED';
interface DemoPackage {
  key: string;
  tier: 'BASIC' | 'BETTER' | 'PREMIUM';
  name: string;
  description: string;
  warrantyText: string;
  warrantyYears: number;
  lines: [item: string, rule: Rule, factor?: number, color?: string][];
}

const PACKAGES: DemoPackage[] = [
  {
    key: 'basicAsphalt',
    tier: 'BASIC',
    name: 'Básico · teja asfáltica',
    description: 'Cambio de techo con teja asfáltica y fieltro sintético.',
    warrantyText: 'Mano de obra 5 años; teja según fabricante',
    warrantyYears: 5,
    lines: [
      ['tear', 'PER_SQUARE'],
      ['synthetic', 'PER_SQUARE'],
      ['asphalt', 'PER_SQUARE', 1, 'Gris pizarra'],
      ['ridge', 'PER_LINEAR_FT_RIDGE'],
      ['drip', 'PER_LINEAR_FT_EAVE'],
      ['installAsphalt', 'PER_SQUARE'],
      ['permit', 'FIXED', 1],
    ],
  },
  {
    key: 'betterAsphalt',
    tier: 'BETTER',
    name: 'Mejor · teja asfáltica con membrana autoadhesiva',
    description: 'Como el Básico, con membrana autoadhesiva contra filtraciones.',
    warrantyText: 'Mano de obra 10 años; teja según fabricante',
    warrantyYears: 10,
    lines: [
      ['tear', 'PER_SQUARE'],
      ['underlay', 'PER_SQUARE'],
      ['asphalt', 'PER_SQUARE', 1, 'Marrón madera'],
      ['ridge', 'PER_LINEAR_FT_RIDGE'],
      ['drip', 'PER_LINEAR_FT_EAVE'],
      ['installAsphalt', 'PER_SQUARE'],
      ['permit', 'FIXED', 1],
    ],
  },
  {
    key: 'betterMetal',
    tier: 'BETTER',
    name: 'Mejor · panel metálico',
    description: 'Techo metálico de junta alzada con membrana autoadhesiva.',
    warrantyText: 'Mano de obra 15 años; panel según fabricante',
    warrantyYears: 15,
    lines: [
      ['tear', 'PER_SQUARE'],
      ['underlay', 'PER_SQUARE'],
      ['metal', 'PER_SQUARE', 1, 'Gris grafito'],
      ['ridge', 'PER_LINEAR_FT_RIDGE'],
      ['drip', 'PER_LINEAR_FT_EAVE'],
      ['installMetal', 'PER_SQUARE'],
      ['permit', 'FIXED', 1],
    ],
  },
  {
    key: 'premiumClay',
    tier: 'PREMIUM',
    name: 'Premium · teja de barro',
    description: 'Teja de barro con membrana autoadhesiva, la opción más duradera.',
    warrantyText: 'Mano de obra 20 años; teja según fabricante',
    warrantyYears: 20,
    lines: [
      ['tear', 'PER_SQUARE'],
      ['underlay', 'PER_SQUARE'],
      ['clay', 'PER_SQUARE', 1, 'Terracota'],
      ['ridge', 'PER_LINEAR_FT_RIDGE'],
      ['drip', 'PER_LINEAR_FT_EAVE'],
      ['installClay', 'PER_SQUARE'],
      ['permit', 'FIXED', 1],
    ],
  },
];

interface DemoQuote {
  customerEmail: string;
  propertyMatch: string;
  packages: string[];
  areaSqFt: number;
  pitchRise: number;
  ridgeFt: number;
  eavesFt: number;
  discountBps?: number;
  taxAppliesToLabor?: boolean;
  state: 'DRAFT' | 'SENT' | 'VIEWED' | 'DECLINED';
  daysAgo: number;
  locale?: 'es' | 'en';
}

const QUOTES: DemoQuote[] = [
  {
    customerEmail: 'cliente@cresta-roofing.example',
    propertyMatch: '1420 Calle de Ejemplo Norte',
    packages: ['basicAsphalt', 'betterAsphalt', 'premiumClay'],
    areaSqFt: 2400,
    pitchRise: 6,
    ridgeFt: 48,
    eavesFt: 150,
    state: 'VIEWED',
    daysAgo: 4,
  },
  {
    customerEmail: 'marta.ruiz@demo-clientes.example',
    propertyMatch: '2310 Calle Ficticia Oeste',
    packages: ['basicAsphalt', 'betterMetal'],
    areaSqFt: 1900,
    pitchRise: 5,
    ridgeFt: 36,
    eavesFt: 130,
    discountBps: 500,
    state: 'SENT',
    daysAgo: 1,
  },
  {
    customerEmail: 'luis.ferrer@demo-clientes.example',
    propertyMatch: '415 Avenida Imaginaria',
    packages: ['betterAsphalt', 'premiumClay'],
    areaSqFt: 1650,
    pitchRise: 4,
    ridgeFt: 30,
    eavesFt: 110,
    state: 'DRAFT',
    daysAgo: 0,
    locale: 'en',
  },
  {
    customerEmail: 'sofia.benitez@demo-clientes.example',
    propertyMatch: '1801 Paseo de Muestra',
    packages: ['betterMetal'],
    areaSqFt: 2200,
    pitchRise: 7,
    ridgeFt: 44,
    eavesFt: 140,
    taxAppliesToLabor: true,
    state: 'DECLINED',
    daysAgo: 9,
  },
];

export async function seedDemoQuotes(db: Db): Promise<void> {
  if (await db.category.findUnique({ where: { name: MARKER_CATEGORY } })) {
    console.log('Los datos demo de catálogo y presupuestos ya existen; no se modifican.');
    return;
  }
  const admin = await db.user.findFirst({
    where: { role: { in: ['ADMIN', 'SUPERADMIN'] }, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!admin) {
    console.log('No hay administración demo; se omiten catálogo y presupuestos demo.');
    return;
  }
  const salesRep = await db.employeeProfile.findFirst({
    where: { jobTypes: { has: 'SALES' }, deletedAt: null },
    select: { id: true },
  });
  // Los presupuestos enviados guardan su PDF en S3 (Garage en local). Sin él, solo borradores.
  // createS3Storage solo lee las variables S3_*; el seed no valida el resto del entorno de la API.
  const s3 = {
    S3_ENDPOINT: process.env.S3_ENDPOINT || undefined,
    S3_REGION: process.env.S3_REGION || 'garage',
    S3_BUCKET: process.env.S3_BUCKET || 'roofing-files',
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || undefined,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || undefined,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE !== 'false',
  };
  const storage: Storage | null = createS3Storage(s3 as unknown as Env);

  await db.$transaction(
    async (tx) => {
      const categoryIds = new Map<string, string>();
      for (const [index, category] of CATEGORIES.entries()) {
        const created = await tx.category.create({ data: { ...category, sortOrder: index } });
        categoryIds.set(category.name, created.id);
      }
      const itemIds = new Map<string, string>();
      const colorIds = new Map<string, string>();
      for (const item of ITEMS) {
        const created = await tx.catalogItem.create({
          data: {
            sku: item.sku,
            name: item.name,
            kind: item.kind,
            unit: item.unit,
            categoryId: categoryIds.get(item.category)!,
            materialPriceCents: item.material ?? 0,
            laborPriceCents: item.labor ?? 0,
            description: DEMO_NOTE,
            ...(item.purchase
              ? {
                  purchaseUnits: {
                    create: {
                      name: item.purchase.name,
                      baseUnitsPerPurchaseUnit: item.purchase.base,
                      isDefault: true,
                    },
                  },
                }
              : {}),
          },
        });
        itemIds.set(item.key, created.id);
        for (const color of item.colors ?? []) {
          const option = await tx.materialOption.create({
            data: { itemId: created.id, kind: 'COLOR', name: color.name, hex: color.hex },
          });
          colorIds.set(`${item.key}:${color.name}`, option.id);
        }
      }
      const packageIds = new Map<string, string>();
      for (const [index, pkg] of PACKAGES.entries()) {
        const created = await tx.package.create({
          data: {
            tier: pkg.tier,
            name: pkg.name,
            description: pkg.description,
            warrantyText: pkg.warrantyText,
            warrantyYears: pkg.warrantyYears,
            sortOrder: index,
            items: {
              create: pkg.lines.map(([itemKey, rule, factor, color], position) => ({
                itemId: itemIds.get(itemKey)!,
                quantityRule: rule,
                factor: factor ?? null,
                defaultMaterialOptionId: color ? colorIds.get(`${itemKey}:${color}`)! : null,
                sortOrder: position,
              })),
            },
          },
        });
        packageIds.set(pkg.key, created.id);
      }

      for (const demo of QUOTES) {
        const property = await tx.property.findFirst({
          where: { addressLine1: demo.propertyMatch, customer: { email: demo.customerEmail } },
          select: { id: true, customerId: true },
        });
        if (!property) continue;
        const sendable = demo.state !== 'DRAFT';
        if (sendable && !storage) {
          console.log(
            `Sin almacenamiento S3: se omite el presupuesto demo ${demo.state} de ${demo.customerEmail}.`,
          );
          continue;
        }
        const measurements = {
          sections: [
            {
              name: 'Techo principal',
              areaSqFt: demo.areaSqFt,
              areaKind: 'PLAN' as const,
              pitchRise: demo.pitchRise,
            },
          ],
          ridgeFt: demo.ridgeFt,
          eavesFt: demo.eavesFt,
          hipsFt: 0,
          valleysFt: 0,
          guttersFt: 0,
        };
        const parameters = {
          wasteBps: 1000,
          taxBps: 700,
          taxAppliesToLabor: demo.taxAppliesToLabor ?? false,
          discountBps: demo.discountBps ?? 0,
          depositBps: 5000,
        };
        const calculation = await calculateForPackages(
          tx,
          demo.packages.map((key) => packageIds.get(key)!),
          measurements,
          parameters,
        );
        const sentAt = new Date(Date.now() - demo.daysAgo * DAY);
        const quote = await tx.quote.create({
          data: {
            customerId: property.customerId,
            propertyId: property.id,
            salesRepId: salesRep?.id ?? null,
            createdById: admin.id,
            createdAt: new Date(sentAt.getTime() - DAY),
          },
        });
        const version = await tx.quoteVersion.create({
          data: {
            quoteId: quote.id,
            versionNumber: 1,
            locale: demo.locale ?? 'es',
            ...parameters,
            measurementsSnapshot: snapshotOf(measurements),
            notes: 'Presupuesto de demostración con precios ficticios.',
            createdById: admin.id,
          },
        });
        await storeOptions(tx, version.id, calculation);
        if (!sendable || !storage) continue;

        const full = await tx.quoteVersion.findUniqueOrThrow({
          where: { id: version.id },
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
        const validUntil = new Date(sentAt.getTime() + 30 * DAY);
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
            originalName: `${quote.number}-v1.pdf`,
            uploadedById: admin.id,
            status: 'READY',
          },
        });
        await tx.quoteVersion.update({
          where: { id: version.id },
          data: {
            status: 'SENT',
            sentAt,
            sentById: admin.id,
            lockedAt: sentAt,
            validUntil,
            pdfFileId: file.id,
            pdfSha256: sha256,
          },
        });
        await tx.quote.update({ where: { id: quote.id }, data: { firstSentAt: sentAt } });
        if (demo.state === 'VIEWED' || demo.state === 'DECLINED') {
          await tx.quoteVersion.update({
            where: { id: version.id },
            data: { status: 'VIEWED', viewedAt: new Date(sentAt.getTime() + 3_600_000) },
          });
        }
        if (demo.state === 'DECLINED') {
          await tx.quoteVersion.update({
            where: { id: version.id },
            data: {
              status: 'DECLINED',
              declinedAt: new Date(sentAt.getTime() + 2 * DAY),
              declineReason: 'Prefiere esperar a la próxima temporada (demostración).',
            },
          });
        }
      }
    },
    { timeout: 120_000 },
  );
  console.log('Datos demo de catálogo y presupuestos creados.');
}
