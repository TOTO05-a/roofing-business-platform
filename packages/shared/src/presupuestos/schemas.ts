import { z } from 'zod';

/**
 * Esquemas Zod del motor de presupuestos, alineados con `docs/arquitectura/modelo-datos.md`.
 *
 * Convenciones:
 * - Dinero: centavos de USD como enteros (`...Cents`).
 * - Porcentajes: puntos base enteros (`...Bps`); 100 bps = 1 %, 10 000 bps = 100 %.
 * - Áreas en pies cuadrados (ft²) y longitudes en pies lineales (ft).
 * - Los enums replican los del modelo de datos (SQUARE, PER_SQUARE, BASIC, ...).
 * - Los límites numéricos evitan desbordes: el resultado debe caber en INT4 (ver `calculate.ts`).
 */

/** Máximo de `Numeric(12,3)`: 999 999 999,999. */
export const MAX_QUANTITY = 999_999_999.999;

/** Límites de entrada (ver `QuoteCalculationError` para la comprobación final de importes). */
export const LIMITS = {
  maxSections: 100,
  maxAreaSqFt: 1_000_000,
  maxLengthFt: 100_000,
  maxUnitPriceCents: 10_000_000,
  maxFactor: 10_000,
  maxBaseUnitsPerPurchaseUnit: 1_000_000,
  maxCatalogItems: 5000,
  maxPackages: 50,
  maxLinesPerPackage: 200,
  maxWarrantyYears: 100,
} as const;

const positiveBounded = (max: number) => z.number().finite().positive().max(max);
const nonNegativeBounded = (max: number) => z.number().finite().min(0).max(max);
const unitPriceCents = z.number().int().min(0).max(LIMITS.maxUnitPriceCents);
const basisPoints = z.number().int().min(0).max(10_000);

/** Código estable de las incidencias de coherencia (`issue.params.code`). */
export type QuoteIssueCode = 'DUPLICATE_ID' | 'UNKNOWN_ITEM' | 'MISSING_FACTOR' | 'INVALID_ITEM';

// ─── Medidas del techo ───────────────────────────────────────────────────────

/** `PLAN`: área proyectada en planta (se corrige por pendiente). `SURFACE`: área real de la superficie. */
export const areaKindSchema = z.enum(['PLAN', 'SURFACE']);
export type AreaKind = z.infer<typeof areaKindSchema>;

export const roofSectionSchema = z.object({
  name: z.string().trim().min(1).optional(),
  /** Área en ft², proyectada en planta o real según `areaKind`. */
  areaSqFt: positiveBounded(LIMITS.maxAreaSqFt),
  areaKind: areaKindSchema,
  /** Pendiente como rise sobre 12 de run (p. ej. 6 = 6/12). Rango 0–24. */
  pitchRise: z.number().finite().min(0).max(24),
});
export type RoofSection = z.infer<typeof roofSectionSchema>;

export const roofMeasurementsSchema = z.object({
  sections: z.array(roofSectionSchema).min(1).max(LIMITS.maxSections),
  ridgeFt: nonNegativeBounded(LIMITS.maxLengthFt).default(0),
  eavesFt: nonNegativeBounded(LIMITS.maxLengthFt).default(0),
  hipsFt: nonNegativeBounded(LIMITS.maxLengthFt).default(0),
  valleysFt: nonNegativeBounded(LIMITS.maxLengthFt).default(0),
  guttersFt: nonNegativeBounded(LIMITS.maxLengthFt).default(0),
});
export type RoofMeasurements = z.infer<typeof roofMeasurementsSchema>;
export type RoofMeasurementsInput = z.input<typeof roofMeasurementsSchema>;

// ─── Catálogo ────────────────────────────────────────────────────────────────

export const catalogKindSchema = z.enum(['MATERIAL', 'LABOR']);
export type CatalogKind = z.infer<typeof catalogKindSchema>;

export const catalogUnitSchema = z.enum(['SQUARE', 'LINEAR_FT', 'UNIT', 'BUNDLE']);
export type CatalogUnit = z.infer<typeof catalogUnitSchema>;

/** Unidad de compra (`PurchaseUnit`): cuántas unidades base trae cada unidad de compra (p. ej. 10 squares por rollo). */
export const purchaseUnitSchema = z.object({
  name: z.string().trim().min(1),
  baseUnitsPerPurchaseUnit: positiveBounded(LIMITS.maxBaseUnitsPerPurchaseUnit).multipleOf(0.001),
});
export type PurchaseUnit = z.infer<typeof purchaseUnitSchema>;

export const catalogItemSchema = z
  .object({
    id: z.string().trim().min(1),
    sku: z.string().trim().min(1).nullable().default(null),
    name: z.string().trim().min(1),
    kind: catalogKindSchema,
    categoryId: z.string().trim().min(1).optional(),
    unit: catalogUnitSchema,
    /** Precio de venta del material por unidad base, en centavos. */
    materialPriceCents: unitPriceCents,
    /** Precio de venta de la mano de obra por unidad base, en centavos. */
    laborPriceCents: unitPriceCents,
    /** Solo para `kind: MATERIAL`; si falta, se compra por unidad base entera. */
    purchaseUnit: purchaseUnitSchema.optional(),
  })
  .superRefine((item, ctx) => {
    if (item.kind === 'LABOR' && item.materialPriceCents !== 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Un artículo de mano de obra debe tener precio de material 0',
        path: ['materialPriceCents'],
        params: { code: 'INVALID_ITEM' satisfies QuoteIssueCode },
      });
    }
    if (item.kind === 'LABOR' && item.purchaseUnit !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Un artículo de mano de obra no tiene unidad de compra',
        path: ['purchaseUnit'],
        params: { code: 'INVALID_ITEM' satisfies QuoteIssueCode },
      });
    }
  });
export type CatalogItem = z.infer<typeof catalogItemSchema>;

export const catalogSchema = z
  .array(catalogItemSchema)
  .max(LIMITS.maxCatalogItems)
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Artículo duplicado en el catálogo: ${item.id}`,
          path: [index, 'id'],
          params: { code: 'DUPLICATE_ID' satisfies QuoteIssueCode },
        });
      }
      seen.add(item.id);
    });
  });

// ─── Paquetes ────────────────────────────────────────────────────────────────

export const packageTierSchema = z.enum(['BASIC', 'BETTER', 'PREMIUM']);
export type PackageTier = z.infer<typeof packageTierSchema>;

/** Regla de cantidad (`PackageItem.quantity_rule`): qué medida multiplica el `factor`. */
export const quantityRuleSchema = z.enum([
  'PER_SQUARE',
  'PER_LINEAR_FT_RIDGE',
  'PER_LINEAR_FT_EAVE',
  'PER_LINEAR_FT_HIP',
  'PER_LINEAR_FT_VALLEY',
  'PER_LINEAR_FT_GUTTER',
  'FIXED',
]);
export type QuantityRule = z.infer<typeof quantityRuleSchema>;

/** Línea de paquete (`PackageItem`). Con `FIXED` el `factor` es la cantidad y es obligatorio; en las demás vale 1 si se omite. */
export const packageLineSchema = z.object({
  itemId: z.string().trim().min(1),
  quantityRule: quantityRuleSchema,
  factor: positiveBounded(LIMITS.maxFactor).multipleOf(0.0001).optional(),
});
export type PackageLine = z.infer<typeof packageLineSchema>;

export const warrantySchema = z.object({
  text: z.string().trim().min(1),
  years: z.number().int().min(0).max(LIMITS.maxWarrantyYears),
});
export type Warranty = z.infer<typeof warrantySchema>;

export const packageDefinitionSchema = z
  .object({
    packageId: z.string().trim().min(1),
    tier: packageTierSchema,
    name: z.string().trim().min(1),
    warranty: warrantySchema,
    lines: z.array(packageLineSchema).min(1).max(LIMITS.maxLinesPerPackage),
  })
  .superRefine((pkg, ctx) => {
    const seen = new Set<string>();
    pkg.lines.forEach((line, index) => {
      if (seen.has(line.itemId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Artículo repetido en el paquete "${pkg.packageId}": ${line.itemId}`,
          path: ['lines', index, 'itemId'],
          params: { code: 'DUPLICATE_ID' satisfies QuoteIssueCode },
        });
      }
      seen.add(line.itemId);
    });
  });
export type PackageDefinition = z.infer<typeof packageDefinitionSchema>;

/** Puede haber varios paquetes por nivel; la unicidad es por `packageId`. */
export const packageDefinitionsSchema = z
  .array(packageDefinitionSchema)
  .min(1)
  .max(LIMITS.maxPackages)
  .superRefine((packages, ctx) => {
    const seen = new Set<string>();
    packages.forEach((pkg, index) => {
      if (seen.has(pkg.packageId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Paquete duplicado: ${pkg.packageId}`,
          path: [index, 'packageId'],
          params: { code: 'DUPLICATE_ID' satisfies QuoteIssueCode },
        });
      }
      seen.add(pkg.packageId);
    });
  });

// ─── Parámetros (QuoteVersion) ───────────────────────────────────────────────

/** Estricto: una clave desconocida (p. ej. el antiguo `markupBps`) es un error. */
export const quoteParametersSchema = z.strictObject({
  /** Desperdicio en puntos base (1500 = 15 %); se aplica a las cantidades de material no fijas. */
  wasteBps: basisPoints,
  /** Tasa de impuesto en puntos base. */
  taxBps: basisPoints,
  /** Si el impuesto también grava la mano de obra (por defecto solo material). */
  taxAppliesToLabor: z.boolean().default(false),
  /** Descuento sobre el subtotal, antes de impuesto. Solo administración. Regla aprobada: antes de impuesto, repartido proporcionalmente. */
  discountBps: basisPoints.default(0),
  /** Anticipo como porcentaje del total, en puntos base. */
  depositBps: basisPoints,
});
export type QuoteParameters = z.infer<typeof quoteParametersSchema>;
export type QuoteParametersInput = z.input<typeof quoteParametersSchema>;

// ─── Entrada completa ────────────────────────────────────────────────────────

export const quoteInputSchema = z
  .object({
    measurements: roofMeasurementsSchema,
    catalog: catalogSchema,
    packages: packageDefinitionsSchema,
    parameters: quoteParametersSchema,
  })
  .superRefine((input, ctx) => {
    const catalogIds = new Set(input.catalog.map((item) => item.id));
    input.packages.forEach((pkg, packageIndex) => {
      pkg.lines.forEach((line, lineIndex) => {
        const path = ['packages', packageIndex, 'lines', lineIndex];
        if (!catalogIds.has(line.itemId)) {
          ctx.addIssue({
            code: 'custom',
            message: `El paquete "${pkg.packageId}" usa un artículo inexistente: ${line.itemId}`,
            path: [...path, 'itemId'],
            params: { code: 'UNKNOWN_ITEM' satisfies QuoteIssueCode },
          });
        }
        if (line.quantityRule === 'FIXED' && line.factor === undefined) {
          ctx.addIssue({
            code: 'custom',
            message: `La línea de cantidad fija del artículo "${line.itemId}" requiere factor`,
            path: [...path, 'factor'],
            params: { code: 'MISSING_FACTOR' satisfies QuoteIssueCode },
          });
        }
      });
    });
  });
export type QuoteInput = z.infer<typeof quoteInputSchema>;
export type QuoteInputRaw = z.input<typeof quoteInputSchema>;

// ─── Resultado ───────────────────────────────────────────────────────────────

/** Instantánea de una partida (`QuoteLine`). `unitPrice × quantity` reproduce el importe de la línea. */
export interface QuoteLine {
  sortOrder: number;
  itemId: string;
  sku: string | null;
  name: string;
  kind: CatalogKind;
  unit: CatalogUnit;
  /** Cantidad facturada (3 decimales, máx. `MAX_QUANTITY`), exactamente la usada en el cálculo. */
  quantity: number;
  /** Unidades de compra (rollos, cajas...) o, sin unidad de compra, igual a `quantity`. */
  purchaseQuantity: number;
  purchaseUnitName: string | null;
  unitMaterialPriceCents: number;
  unitLaborPriceCents: number;
  lineMaterialCents: number;
  lineLaborCents: number;
  lineTotalCents: number;
}

export interface QuotePackageResult {
  packageId: string;
  tier: PackageTier;
  name: string;
  warranty: Warranty;
  lines: QuoteLine[];
  /** Subtotales antes de descuento e impuesto. */
  materialSubtotalCents: number;
  laborSubtotalCents: number;
  discountCents: number;
  taxCents: number;
  /** material + mano de obra − descuento + impuesto. */
  totalCents: number;
  depositCents: number;
  balanceCents: number;
}

export interface RoofSummary {
  surfaceAreaSqFt: number;
  squares: number;
}

export interface QuoteResult {
  roof: RoofSummary;
  packages: QuotePackageResult[];
}
