import { applyDiscount } from './discount.js';
import { summarizeRoof } from './geometry.js';
import {
  applyWaste,
  ceilSnapped,
  percentOfCents,
  QUANTITY_SCALE,
  scaledQuantityTimesCents,
  toScaledQuantity,
} from './money.js';
import {
  quoteInputSchema,
  type CatalogItem,
  type PackageDefinition,
  type PackageLine,
  type QuoteInput,
  type QuoteLine,
  type QuoteParameters,
  type QuotePackageResult,
  type QuoteResult,
  type RoofMeasurements,
} from './schemas.js';

/** Valor máximo de una columna INT4 de PostgreSQL. */
const INT4_MAX = 2_147_483_647;

export type QuoteCalculationErrorCode =
  'UNKNOWN_ITEM' | 'MISSING_FACTOR' | 'AMOUNT_NOT_SAFE_INTEGER' | 'AMOUNT_EXCEEDS_INT4';

/** Error de cálculo con `code` estable; el mensaje está en español. */
export class QuoteCalculationError extends Error {
  override readonly name = 'QuoteCalculationError';
  readonly code: QuoteCalculationErrorCode;

  constructor(code: QuoteCalculationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** Medida base de la regla de cantidad (para `FIXED` es 1: la cantidad es el factor). */
function ruleMeasure(line: PackageLine, measurements: RoofMeasurements, squares: number): number {
  switch (line.quantityRule) {
    case 'PER_SQUARE':
      return squares;
    case 'PER_LINEAR_FT_RIDGE':
      return measurements.ridgeFt;
    case 'PER_LINEAR_FT_EAVE':
      return measurements.eavesFt;
    case 'PER_LINEAR_FT_HIP':
      return measurements.hipsFt;
    case 'PER_LINEAR_FT_VALLEY':
      return measurements.valleysFt;
    case 'PER_LINEAR_FT_GUTTER':
      return measurements.guttersFt;
    case 'FIXED':
      return 1;
  }
}

interface Quantity {
  /** Cantidad facturada en milésimas. */
  milli: number;
  purchaseQuantity: number;
  purchaseUnitName: string | null;
}

/**
 * Cantidad de una línea:
 * - MANO DE OBRA: medida × factor, redondeada half-up a milésimas; sin desperdicio ni compra.
 * - MATERIAL: medida × factor, con desperdicio (salvo regla FIXED); se redondea SIEMPRE hacia arriba
 *   a unidades de compra enteras (o a unidad base entera si no hay unidad de compra). La cantidad
 *   facturada es lo realmente comprado, expresado en unidad base.
 */
function lineQuantity(
  item: CatalogItem,
  line: PackageLine,
  base: number,
  wasteBps: number,
): Quantity {
  const raw = base * (line.factor ?? 1);
  if (item.kind === 'LABOR') {
    const milli = toScaledQuantity(raw);
    return { milli, purchaseQuantity: milli / QUANTITY_SCALE, purchaseUnitName: null };
  }
  const needed = line.quantityRule === 'FIXED' ? raw : applyWaste(raw, wasteBps);
  const purchase = item.purchaseUnit;
  if (purchase === undefined) {
    const whole = ceilSnapped(needed);
    return { milli: whole * QUANTITY_SCALE, purchaseQuantity: whole, purchaseUnitName: null };
  }
  const packs = ceilSnapped(needed / purchase.baseUnitsPerPurchaseUnit);
  return {
    milli: toScaledQuantity(packs * purchase.baseUnitsPerPurchaseUnit),
    purchaseQuantity: packs,
    purchaseUnitName: purchase.name,
  };
}

function buildLine(
  item: CatalogItem,
  line: PackageLine,
  sortOrder: number,
  measurements: RoofMeasurements,
  squares: number,
  parameters: QuoteParameters,
): QuoteLine {
  const base = ruleMeasure(line, measurements, squares);
  const { milli, purchaseQuantity, purchaseUnitName } = lineQuantity(
    item,
    line,
    base,
    parameters.wasteBps,
  );
  const lineMaterialCents = scaledQuantityTimesCents(milli, item.materialPriceCents);
  const lineLaborCents = scaledQuantityTimesCents(milli, item.laborPriceCents);
  return {
    sortOrder,
    itemId: item.id,
    sku: item.sku,
    name: item.name,
    kind: item.kind,
    unit: item.unit,
    quantity: milli / QUANTITY_SCALE,
    purchaseQuantity,
    purchaseUnitName,
    unitMaterialPriceCents: item.materialPriceCents,
    unitLaborPriceCents: item.laborPriceCents,
    lineMaterialCents,
    lineLaborCents,
    lineTotalCents: lineMaterialCents + lineLaborCents,
  };
}

function buildPackage(
  definition: PackageDefinition,
  catalog: ReadonlyMap<string, CatalogItem>,
  measurements: RoofMeasurements,
  squares: number,
  parameters: QuoteParameters,
): QuotePackageResult {
  const lines = definition.lines.map((packageLine, index) => {
    const item = catalog.get(packageLine.itemId);
    if (item === undefined) {
      throw new QuoteCalculationError(
        'UNKNOWN_ITEM',
        `El paquete "${definition.packageId}" usa un artículo inexistente: ${packageLine.itemId}`,
      );
    }
    if (packageLine.quantityRule === 'FIXED' && packageLine.factor === undefined) {
      throw new QuoteCalculationError(
        'MISSING_FACTOR',
        `La línea de cantidad fija del artículo "${packageLine.itemId}" requiere factor`,
      );
    }
    return buildLine(item, packageLine, index, measurements, squares, parameters);
  });

  const materialSubtotalCents = lines.reduce((sum, line) => sum + line.lineMaterialCents, 0);
  const laborSubtotalCents = lines.reduce((sum, line) => sum + line.lineLaborCents, 0);
  const discounted = applyDiscount(
    materialSubtotalCents,
    laborSubtotalCents,
    parameters.discountBps,
  );
  // Base imponible: material (y mano de obra si el flag lo indica), ya con descuento.
  const taxableCents =
    discounted.materialCents + (parameters.taxAppliesToLabor ? discounted.laborCents : 0);
  const taxCents = percentOfCents(taxableCents, parameters.taxBps);
  const totalCents = discounted.materialCents + discounted.laborCents + taxCents;
  const depositCents = percentOfCents(totalCents, parameters.depositBps);

  return {
    packageId: definition.packageId,
    tier: definition.tier,
    name: definition.name,
    warranty: definition.warranty,
    lines,
    materialSubtotalCents,
    laborSubtotalCents,
    discountCents: discounted.discountCents,
    taxCents,
    totalCents,
    depositCents,
    balanceCents: totalCents - depositCents,
  };
}

/** Todos los importes deben ser enteros seguros y caber en INT4. */
function assertAmountsInRange(result: QuoteResult): void {
  for (const pkg of result.packages) {
    const amounts = [
      pkg.materialSubtotalCents,
      pkg.laborSubtotalCents,
      pkg.discountCents,
      pkg.taxCents,
      pkg.totalCents,
      pkg.depositCents,
      pkg.balanceCents,
      ...pkg.lines.flatMap((l) => [l.lineMaterialCents, l.lineLaborCents, l.lineTotalCents]),
    ];
    for (const amount of amounts) {
      if (!Number.isSafeInteger(amount)) {
        throw new QuoteCalculationError(
          'AMOUNT_NOT_SAFE_INTEGER',
          `Un importe del paquete "${pkg.packageId}" no es un entero seguro`,
        );
      }
      if (amount > INT4_MAX) {
        throw new QuoteCalculationError(
          'AMOUNT_EXCEEDS_INT4',
          `Un importe del paquete "${pkg.packageId}" supera ${INT4_MAX} centavos`,
        );
      }
    }
  }
}

/** Calcula los paquetes a partir de una entrada ya validada. */
export function calculateQuote(input: QuoteInput): QuoteResult {
  const { measurements, catalog, packages, parameters } = input;
  const roof = summarizeRoof(measurements);
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const result: QuoteResult = {
    roof,
    packages: packages.map((definition) =>
      buildPackage(definition, catalogById, measurements, roof.squares, parameters),
    ),
  };
  assertAmountsInRange(result);
  return result;
}

/** Valida con Zod (lanza `ZodError` si es inválida) y calcula. Punto de entrada para datos externos. */
export function calculateQuoteFromRaw(raw: unknown): QuoteResult {
  return calculateQuote(quoteInputSchema.parse(raw));
}
