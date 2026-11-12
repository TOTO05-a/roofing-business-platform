import { summarizeRoof } from './geometry.js';
import {
  addMarkupCents,
  ceilSnapped,
  percentOfCents,
  scaledQuantityTimesCents,
  snap,
  toScaledQuantity,
} from './money.js';
import {
  quoteInputSchema,
  type CatalogItem,
  type PackageDefinition,
  type PackageLine,
  type QuoteInput,
  type QuoteInputRaw,
  type QuoteLine,
  type QuoteParameters,
  type QuotePackageResult,
  type QuoteResult,
  type RoofMeasurements,
} from './schemas.js';

/** Error de datos coherentes por separado pero inconsistentes entre sí (p. ej. artículo inexistente). */
export class QuoteCalculationError extends Error {
  override readonly name = 'QuoteCalculationError';
}

/** Cantidad necesaria (en unidades de medida) de un artículo según su base de cálculo. */
function measuredQuantity(
  item: CatalogItem,
  line: PackageLine,
  measurements: RoofMeasurements,
  squares: number,
): number {
  switch (item.quantityBasis) {
    case 'roof_squares':
      return squares;
    case 'ridge_ft':
      return measurements.ridgeFt;
    case 'eaves_ft':
      return measurements.eavesFt;
    case 'hips_ft':
      return measurements.hipsFt;
    case 'valleys_ft':
      return measurements.valleysFt;
    case 'ridge_and_hips_ft':
      return measurements.ridgeFt + measurements.hipsFt;
    case 'gutters_ft':
      return measurements.guttersFt;
    case 'fixed':
      if (line.fixedQuantity === undefined) {
        throw new QuoteCalculationError(
          `El artículo "${item.id}" es de cantidad fija y la línea no indica fixedQuantity`,
        );
      }
      return line.fixedQuantity;
  }
}

/** Unidades compradas: aplica desperdicio, convierte a unidades de compra y redondea hacia arriba. */
function purchasedQuantity(item: CatalogItem, measured: number, wasteBps: number): number {
  const withWaste = item.appliesWaste ? measured * (1 + wasteBps / 10_000) : measured;
  const purchase = item.purchaseUnit;
  if (purchase === undefined) {
    return ceilSnapped(withWaste);
  }
  return purchase.kind === 'packages_per_unit'
    ? ceilSnapped(withWaste * purchase.count)
    : ceilSnapped(withWaste / purchase.count);
}

function buildLine(
  item: CatalogItem,
  line: PackageLine,
  measurements: RoofMeasurements,
  squares: number,
  parameters: QuoteParameters,
): QuoteLine {
  const measured = measuredQuantity(item, line, measurements, squares);
  const purchased = purchasedQuantity(item, measured, parameters.wasteBps);

  // Material: unidades de compra enteras × precio por unidad de compra, más recargo.
  const materialCents = addMarkupCents(purchased * item.materialPriceCents, parameters.markupBps);
  // Mano de obra: cantidad medida (sin desperdicio ni redondeo de compra) × tarifa, más recargo.
  const laborBase = scaledQuantityTimesCents(toScaledQuantity(measured), item.laborPerUnitCents);
  const laborCents = addMarkupCents(laborBase, parameters.markupBps);

  return {
    itemId: item.id,
    name: item.name,
    category: item.category,
    unit: item.unit,
    measuredQuantity: snap(measured),
    purchasedQuantity: purchased,
    purchaseUnitLabel: item.purchaseUnit?.label ?? null,
    materialCents,
    laborCents,
    totalCents: materialCents + laborCents,
  };
}

function buildPackage(
  definition: PackageDefinition,
  catalog: ReadonlyMap<string, CatalogItem>,
  measurements: RoofMeasurements,
  squares: number,
  parameters: QuoteParameters,
): QuotePackageResult {
  const lines = definition.lines.map((packageLine) => {
    const item = catalog.get(packageLine.itemId);
    if (item === undefined) {
      throw new QuoteCalculationError(
        `El paquete "${definition.tier}" usa un artículo inexistente: "${packageLine.itemId}"`,
      );
    }
    return buildLine(item, packageLine, measurements, squares, parameters);
  });

  const materialSubtotalCents = lines.reduce((sum, line) => sum + line.materialCents, 0);
  const laborSubtotalCents = lines.reduce((sum, line) => sum + line.laborCents, 0);
  // El impuesto grava solo el subtotal de materiales (ya con recargo).
  const taxCents = percentOfCents(materialSubtotalCents, parameters.materialTaxBps);
  const totalCents = materialSubtotalCents + laborSubtotalCents + taxCents;
  const depositCents = percentOfCents(totalCents, parameters.depositBps);

  return {
    tier: definition.tier,
    name: definition.name,
    warranty: definition.warranty,
    lines,
    materialSubtotalCents,
    laborSubtotalCents,
    taxCents,
    totalCents,
    depositCents,
    balanceCents: totalCents - depositCents,
  };
}

/** Calcula los paquetes a partir de una entrada ya validada. */
export function calculateQuote(input: QuoteInput): QuoteResult {
  const { measurements, catalog, packages, parameters } = input;
  const roof = summarizeRoof(measurements, parameters.wasteBps);
  const catalogById = new Map(catalog.map((item) => [item.id, item]));

  return {
    roof,
    packages: packages.map((definition) =>
      buildPackage(definition, catalogById, measurements, roof.squares, parameters),
    ),
  };
}

/** Valida con Zod (lanza `ZodError` si es inválida) y calcula. Punto de entrada para datos externos. */
export function calculateQuoteFromRaw(raw: QuoteInputRaw | unknown): QuoteResult {
  return calculateQuote(quoteInputSchema.parse(raw));
}
