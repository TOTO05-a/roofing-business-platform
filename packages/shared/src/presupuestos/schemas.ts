import { z } from 'zod';

/**
 * Esquemas Zod del motor de presupuestos.
 *
 * Convenciones:
 * - Dinero: siempre centavos de USD como enteros (`...Cents`).
 * - Porcentajes: puntos base enteros (`...Bps`); 100 bps = 1 %, 10 000 bps = 100 %.
 * - Áreas en pies cuadrados (ft²) y longitudes en pies lineales (ft).
 */

const nonNegativeFiniteNumber = z.number().finite().min(0);
const positiveFiniteNumber = z.number().finite().positive();
const cents = z.number().int().min(0);
const basisPoints = z.number().int().min(0).max(10_000);

// ─── Medidas del techo ───────────────────────────────────────────────────────

/** `plan`: área proyectada en planta (se corrige por pendiente). `surface`: área real de la superficie. */
export const areaKindSchema = z.enum(['plan', 'surface']);
export type AreaKind = z.infer<typeof areaKindSchema>;

export const roofSectionSchema = z.object({
  name: z.string().trim().min(1).optional(),
  /** Área en ft², proyectada en planta o real según `areaKind`. */
  areaSqFt: positiveFiniteNumber,
  areaKind: areaKindSchema,
  /** Pendiente expresada como rise sobre 12 de run (p. ej. 6 = 6/12). Rango 0–24. */
  pitchRise: z.number().finite().min(0).max(24),
});
export type RoofSection = z.infer<typeof roofSectionSchema>;

export const roofMeasurementsSchema = z.object({
  sections: z.array(roofSectionSchema).min(1),
  ridgeFt: nonNegativeFiniteNumber.default(0),
  eavesFt: nonNegativeFiniteNumber.default(0),
  hipsFt: nonNegativeFiniteNumber.default(0),
  valleysFt: nonNegativeFiniteNumber.default(0),
  guttersFt: nonNegativeFiniteNumber.default(0),
});
export type RoofMeasurements = z.infer<typeof roofMeasurementsSchema>;
export type RoofMeasurementsInput = z.input<typeof roofMeasurementsSchema>;

// ─── Catálogo ────────────────────────────────────────────────────────────────

export const catalogUnitSchema = z.enum(['square', 'linear_foot', 'each', 'package']);
export type CatalogUnit = z.infer<typeof catalogUnitSchema>;

export const catalogCategorySchema = z.enum([
  'shingles',
  'underlayment',
  'flashing',
  'ventilation',
  'ridge_cap',
  'accessories',
  'gutters',
  'tear_off',
  'disposal',
  'other',
]);
export type CatalogCategory = z.infer<typeof catalogCategorySchema>;

/** Medida del techo que determina la cantidad necesaria de un artículo. */
export const quantityBasisSchema = z.enum([
  'roof_squares',
  'ridge_ft',
  'eaves_ft',
  'hips_ft',
  'valleys_ft',
  'ridge_and_hips_ft',
  'gutters_ft',
  'fixed',
]);
export type QuantityBasis = z.infer<typeof quantityBasisSchema>;

/**
 * Unidad de compra. Si se omite, el material se compra por unidad de medida entera.
 * - `packages_per_unit`: paquetes por unidad de medida (p. ej. 3 paquetes por square).
 * - `units_per_package`: unidades de medida por paquete (p. ej. 400 ft por rollo).
 */
export const purchaseUnitSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('packages_per_unit'),
    label: z.string().trim().min(1),
    count: positiveFiniteNumber,
  }),
  z.object({
    kind: z.literal('units_per_package'),
    label: z.string().trim().min(1),
    count: positiveFiniteNumber,
  }),
]);
export type PurchaseUnit = z.infer<typeof purchaseUnitSchema>;

export const catalogItemSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  category: catalogCategorySchema,
  /** Unidad de medida en la que se expresa la cantidad necesaria y la mano de obra. */
  unit: catalogUnitSchema,
  quantityBasis: quantityBasisSchema,
  purchaseUnit: purchaseUnitSchema.optional(),
  /** Precio del material por unidad de compra (o por unidad de medida si no hay `purchaseUnit`), en centavos. */
  materialPriceCents: cents,
  /** Mano de obra por unidad de medida, en centavos. */
  laborPerUnitCents: cents,
  /** Si el factor de desperdicio aplica a la cantidad de material. */
  appliesWaste: z.boolean(),
});
export type CatalogItem = z.infer<typeof catalogItemSchema>;

export const catalogSchema = z.array(catalogItemSchema).superRefine((items, ctx) => {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `Artículo duplicado en el catálogo: ${item.id}`,
        path: [index, 'id'],
      });
    }
    seen.add(item.id);
  });
});

// ─── Paquetes ────────────────────────────────────────────────────────────────

export const packageTierSchema = z.enum(['basic', 'better', 'premium']);
export type PackageTier = z.infer<typeof packageTierSchema>;

export const packageLineSchema = z.object({
  itemId: z.string().trim().min(1),
  /** Cantidad (en unidades de medida) para artículos con `quantityBasis: 'fixed'`. */
  fixedQuantity: positiveFiniteNumber.optional(),
});
export type PackageLine = z.infer<typeof packageLineSchema>;

export const warrantySchema = z.object({
  text: z.string().trim().min(1),
  years: z.number().int().min(0),
});
export type Warranty = z.infer<typeof warrantySchema>;

export const packageDefinitionSchema = z.object({
  tier: packageTierSchema,
  name: z.string().trim().min(1),
  warranty: warrantySchema,
  lines: z.array(packageLineSchema).min(1),
});
export type PackageDefinition = z.infer<typeof packageDefinitionSchema>;

export const packageDefinitionsSchema = z
  .array(packageDefinitionSchema)
  .min(1)
  .superRefine((packages, ctx) => {
    const seen = new Set<string>();
    packages.forEach((pkg, index) => {
      if (seen.has(pkg.tier)) {
        ctx.addIssue({
          code: 'custom',
          message: `Paquete duplicado: ${pkg.tier}`,
          path: [index, 'tier'],
        });
      }
      seen.add(pkg.tier);
    });
  });

// ─── Parámetros ──────────────────────────────────────────────────────────────

export const quoteParametersSchema = z.object({
  /** Desperdicio en puntos base (1500 = 15 %). */
  wasteBps: basisPoints,
  /** Impuesto sobre materiales en puntos base. */
  materialTaxBps: basisPoints,
  /** Recargo (markup sobre costo) en puntos base; se aplica a material y mano de obra. */
  markupBps: z.number().int().min(0).max(100_000),
  /** Anticipo como porcentaje del total, en puntos base. */
  depositBps: basisPoints,
});
export type QuoteParameters = z.infer<typeof quoteParametersSchema>;

// ─── Entrada completa y resultado ────────────────────────────────────────────

export const quoteInputSchema = z.object({
  measurements: roofMeasurementsSchema,
  catalog: catalogSchema,
  packages: packageDefinitionsSchema,
  parameters: quoteParametersSchema,
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;
export type QuoteInputRaw = z.input<typeof quoteInputSchema>;

export interface QuoteLine {
  itemId: string;
  name: string;
  category: CatalogCategory;
  unit: CatalogUnit;
  /** Cantidad medida (sin desperdicio) en unidades de medida. */
  measuredQuantity: number;
  /** Cantidad comprada, en unidades de compra enteras (o de medida si no hay `purchaseUnit`). */
  purchasedQuantity: number;
  purchaseUnitLabel: string | null;
  materialCents: number;
  laborCents: number;
  totalCents: number;
}

export interface QuotePackageResult {
  tier: PackageTier;
  name: string;
  warranty: Warranty;
  lines: QuoteLine[];
  materialSubtotalCents: number;
  laborSubtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
}

export interface RoofSummary {
  surfaceAreaSqFt: number;
  squares: number;
  squaresWithWaste: number;
}

export interface QuoteResult {
  roof: RoofSummary;
  packages: QuotePackageResult[];
}
