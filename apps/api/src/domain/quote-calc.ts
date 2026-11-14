import { ZodError } from 'zod';
import {
  calculateQuoteFromRaw,
  QuoteCalculationError,
  quoteParametersSchema,
  roofMeasurementsSchema,
  summarizeRoof,
  type QuoteInputRaw,
  type QuoteParameters,
  type QuoteResult,
  type RoofMeasurements,
  type RoofSummary,
} from '@roofing/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import type { RlsTx } from '../lib/rls.js';

/**
 * Cálculo de un presupuesto con el motor puro de `@roofing/shared` (P3, P4, P5, P11, P12, P13):
 * esta capa solo arma su entrada desde la base de datos y guarda el resultado como opciones y
 * líneas congeladas. Ninguna regla de dinero vive aquí.
 */

export const DEFAULT_PARAMETERS = {
  wasteBps: 1000,
  taxBps: 700,
  taxAppliesToLabor: false,
  discountBps: 0,
  depositBps: 5000,
} as const;

/** Parámetros editables; el descuento solo lo aplica la oficina (P10): todas las rutas de escritura lo son. */
export const parametersInputSchema = quoteParametersSchema.partial();
export { roofMeasurementsSchema };
export type { QuoteParameters };

export type VersionSnapshot = {
  measurements: RoofMeasurements;
  roof: RoofSummary;
};

export const measurementsSnapshotSchema = z.object({
  measurements: roofMeasurementsSchema,
  roof: z.object({ surfaceAreaSqFt: z.number(), squares: z.number() }),
});

/** Medidas de una inspección completada (suma de sus secciones; las áreas son en planta). */
export async function measurementsFromInspection(
  tx: RlsTx,
  inspectionId: string,
  propertyId: string,
): Promise<RoofMeasurements> {
  const inspection = await tx.inspection.findFirst({
    where: { id: inspectionId, propertyId, deletedAt: null },
    select: { status: true, sections: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!inspection) throw new HttpError(404, 'NOT_FOUND', 'Inspección no encontrada');
  if (inspection.status !== 'COMPLETED') {
    throw new HttpError(409, 'INSPECTION_NOT_COMPLETED', 'La inspección aún no está completada');
  }
  if (inspection.sections.length === 0) {
    throw new HttpError(409, 'INSPECTION_WITHOUT_SECTIONS', 'La inspección no tiene secciones');
  }
  const { sections } = inspection;
  const sum = (pick: (s: (typeof sections)[number]) => { toNumber(): number }) =>
    sections.reduce((total, s) => total + pick(s).toNumber(), 0);
  return roofMeasurementsSchema.parse({
    sections: sections.map((s) => ({
      name: s.name,
      areaSqFt: s.areaSqft.toNumber(),
      areaKind: 'PLAN',
      pitchRise: s.pitchRise.toNumber(),
    })),
    ridgeFt: sum((s) => s.ridgeFt),
    eavesFt: sum((s) => s.eaveFt),
    hipsFt: sum((s) => s.hipFt),
    valleysFt: sum((s) => s.valleyFt),
    guttersFt: sum((s) => s.gutterFt),
  });
}

interface Calculation {
  result: QuoteResult;
  /** Color/textura por defecto de cada artículo en cada paquete (informativo, va en la línea). */
  defaults: Map<string, { materialOptionId: string; kind: 'COLOR' | 'TEXTURE'; name: string }>;
  packages: Map<string, { warrantyText: string; warrantyYears: number }>;
}

/** Arma la entrada del motor con el catálogo vigente de los paquetes pedidos y la calcula. */
export async function calculateForPackages(
  tx: RlsTx,
  packageIds: string[],
  measurements: RoofMeasurements,
  parameters: QuoteParameters,
): Promise<Calculation> {
  const packages = await tx.package.findMany({
    where: { id: { in: packageIds }, isActive: true },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
        include: {
          defaultMaterialOption: true,
          item: { include: { purchaseUnits: true } },
        },
      },
    },
  });
  if (packages.length !== new Set(packageIds).size) {
    throw new HttpError(404, 'NOT_FOUND', 'Algún paquete no existe o está inactivo');
  }
  const byId = new Map(packages.map((p) => [p.id, p]));
  const ordered = packageIds.map((id) => byId.get(id)!);

  const catalog = new Map<string, QuoteInputRaw['catalog'][number]>();
  const defaults: Calculation['defaults'] = new Map();
  for (const pkg of ordered) {
    for (const line of pkg.items) {
      const { item } = line;
      if (item.deletedAt !== null || !item.isActive) {
        throw new HttpError(
          409,
          'ITEM_INACTIVE',
          `El paquete "${pkg.name}" usa un artículo inactivo: ${item.name}`,
        );
      }
      const unit = item.purchaseUnits.find((u) => u.isDefault) ?? item.purchaseUnits[0];
      catalog.set(item.id, {
        id: item.id,
        sku: item.sku,
        name: item.name,
        kind: item.kind,
        unit: item.unit,
        materialPriceCents: item.materialPriceCents,
        laborPriceCents: item.laborPriceCents,
        ...(unit && item.kind === 'MATERIAL'
          ? {
              purchaseUnit: {
                name: unit.name,
                baseUnitsPerPurchaseUnit: unit.baseUnitsPerPurchaseUnit.toNumber(),
              },
            }
          : {}),
      });
      if (line.defaultMaterialOption) {
        defaults.set(`${pkg.id}:${item.id}`, {
          materialOptionId: line.defaultMaterialOption.id,
          kind: line.defaultMaterialOption.kind,
          name: line.defaultMaterialOption.name,
        });
      }
    }
  }

  const raw: QuoteInputRaw = {
    measurements,
    catalog: [...catalog.values()],
    parameters,
    packages: ordered.map((pkg) => ({
      packageId: pkg.id,
      tier: pkg.tier,
      name: pkg.name,
      warranty: { text: pkg.warrantyText, years: pkg.warrantyYears },
      lines: pkg.items.map((line) => ({
        itemId: line.itemId,
        quantityRule: line.quantityRule,
        ...(line.factor ? { factor: line.factor.toNumber() } : {}),
      })),
    })),
  };
  try {
    return {
      result: calculateQuoteFromRaw(raw),
      defaults,
      packages: new Map(
        ordered.map((p) => [
          p.id,
          { warrantyText: p.warrantyText, warrantyYears: p.warrantyYears },
        ]),
      ),
    };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(422, 'QUOTE_INPUT_INVALID', 'Los datos del presupuesto no son válidos', {
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (error instanceof QuoteCalculationError) {
      throw new HttpError(422, error.code, error.message);
    }
    throw error;
  }
}

/** Guarda el resultado del motor como opciones y líneas de una versión en borrador. */
export async function storeOptions(
  tx: RlsTx,
  versionId: string,
  calculation: Calculation,
): Promise<void> {
  await tx.quoteOption.deleteMany({ where: { versionId } });
  for (const [index, pkg] of calculation.result.packages.entries()) {
    const warranty = calculation.packages.get(pkg.packageId)!;
    const data: Prisma.QuoteOptionCreateInput = {
      version: { connect: { id: versionId } },
      package: { connect: { id: pkg.packageId } },
      tier: pkg.tier,
      title: pkg.name,
      warrantyText: warranty.warrantyText,
      warrantyYears: warranty.warrantyYears,
      sortOrder: index,
      materialSubtotalCents: pkg.materialSubtotalCents,
      laborSubtotalCents: pkg.laborSubtotalCents,
      discountCents: pkg.discountCents,
      taxCents: pkg.taxCents,
      totalCents: pkg.totalCents,
      depositCents: pkg.depositCents,
      balanceCents: pkg.balanceCents,
      lines: {
        create: pkg.lines.map((line) => {
          const chosen = calculation.defaults.get(`${pkg.packageId}:${line.itemId}`);
          return {
            sortOrder: line.sortOrder,
            item: { connect: { id: line.itemId } },
            ...(chosen ? { materialOption: { connect: { id: chosen.materialOptionId } } } : {}),
            name: line.name,
            sku: line.sku,
            kind: line.kind,
            unit: line.unit,
            quantity: line.quantity,
            purchaseUnitName: line.purchaseUnitName,
            purchaseQuantity: line.purchaseQuantity,
            unitMaterialPriceCents: line.unitMaterialPriceCents,
            unitLaborPriceCents: line.unitLaborPriceCents,
            lineMaterialCents: line.lineMaterialCents,
            lineLaborCents: line.lineLaborCents,
            lineTotalCents: line.lineTotalCents,
            colorName: chosen?.kind === 'COLOR' ? chosen.name : null,
            textureName: chosen?.kind === 'TEXTURE' ? chosen.name : null,
          };
        }),
      },
    };
    await tx.quoteOption.create({ data });
  }
}

export function snapshotOf(measurements: RoofMeasurements): Prisma.InputJsonObject {
  const snapshot: VersionSnapshot = { measurements, roof: summarizeRoof(measurements) };
  return JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonObject;
}
