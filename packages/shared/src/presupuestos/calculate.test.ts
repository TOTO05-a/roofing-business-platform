/* eslint-disable @typescript-eslint/no-explicit-any --
   Los casos inválidos mutan el JSON de entrada a propósito: se tipa de forma laxa solo en estas pruebas. */
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { calculateQuote, calculateQuoteFromRaw, QuoteCalculationError } from './calculate.js';
import { quoteInputSchema, type QuoteInput, type QuoteInputRaw } from './schemas.js';

// Datos de EJEMPLO solo para pruebas: no son precios ni porcentajes del negocio.
const catalog: QuoteInputRaw['catalog'] = [
  {
    id: 'shingle-basic',
    sku: 'SH-B',
    name: 'Teja básica',
    kind: 'MATERIAL',
    unit: 'BUNDLE',
    materialPriceCents: 3000,
    laborPriceCents: 0,
  },
  {
    id: 'shingle-premium',
    name: 'Teja premium',
    kind: 'MATERIAL',
    unit: 'BUNDLE',
    materialPriceCents: 4500,
    laborPriceCents: 0,
  },
  {
    id: 'install',
    name: 'Instalación',
    kind: 'LABOR',
    unit: 'SQUARE',
    materialPriceCents: 0,
    laborPriceCents: 10_000,
  },
  {
    id: 'underlayment',
    name: 'Membrana',
    kind: 'MATERIAL',
    unit: 'SQUARE',
    purchaseUnit: { name: 'roll', baseUnitsPerPurchaseUnit: 10 },
    materialPriceCents: 800,
    laborPriceCents: 0,
  },
  {
    id: 'ridge-cap',
    name: 'Cumbrera',
    kind: 'MATERIAL',
    unit: 'LINEAR_FT',
    purchaseUnit: { name: 'bundle', baseUnitsPerPurchaseUnit: 30 },
    materialPriceCents: 150,
    laborPriceCents: 0,
  },
  {
    id: 'drip-edge',
    name: 'Gotero',
    kind: 'MATERIAL',
    unit: 'LINEAR_FT',
    materialPriceCents: 150,
    laborPriceCents: 100,
  },
  {
    id: 'vent',
    name: 'Ventilación',
    kind: 'MATERIAL',
    unit: 'UNIT',
    materialPriceCents: 2500,
    laborPriceCents: 5000,
  },
];

const warranty = (years: number) => ({ text: `Garantía de ejemplo ${years} años`, years });

const common = [
  { itemId: 'install', quantityRule: 'PER_SQUARE' },
  { itemId: 'underlayment', quantityRule: 'PER_SQUARE' },
  { itemId: 'drip-edge', quantityRule: 'PER_LINEAR_FT_EAVE' },
] as const;
const extras = [
  { itemId: 'ridge-cap', quantityRule: 'PER_LINEAR_FT_RIDGE' },
  { itemId: 'vent', quantityRule: 'FIXED', factor: 4 },
] as const;

const baseInput: QuoteInputRaw = {
  measurements: {
    sections: [{ areaSqFt: 3000, areaKind: 'SURFACE', pitchRise: 6 }],
    ridgeFt: 100,
    eavesFt: 120,
  },
  catalog,
  packages: [
    {
      packageId: 'basic-1',
      tier: 'BASIC',
      name: 'Básico',
      warranty: warranty(10),
      lines: [{ itemId: 'shingle-basic', quantityRule: 'PER_SQUARE', factor: 3 }, ...common],
    },
    {
      packageId: 'better-1',
      tier: 'BETTER',
      name: 'Mejor',
      warranty: warranty(20),
      lines: [
        { itemId: 'shingle-basic', quantityRule: 'PER_SQUARE', factor: 3 },
        ...common,
        ...extras,
      ],
    },
    {
      packageId: 'premium-1',
      tier: 'PREMIUM',
      name: 'Premium',
      warranty: warranty(30),
      lines: [
        { itemId: 'shingle-premium', quantityRule: 'PER_SQUARE', factor: 3 },
        ...common,
        ...extras,
      ],
    },
  ],
  parameters: { wasteBps: 1000, taxBps: 825, depositBps: 3000 },
};

const firstPackage = baseInput.packages[0];
if (firstPackage === undefined) throw new Error('fixture');

const withParameters = (parameters: Record<string, unknown>): QuoteInputRaw => ({
  ...baseInput,
  parameters: { ...baseInput.parameters, ...parameters } as QuoteInputRaw['parameters'],
});

function parseError(raw: unknown): ZodError {
  try {
    calculateQuoteFromRaw(raw);
  } catch (error) {
    if (error instanceof ZodError) return error;
    throw error;
  }
  throw new Error('se esperaba un ZodError');
}

const basicOf = (input: QuoteInputRaw) => {
  const pkg = calculateQuoteFromRaw(input).packages[0];
  if (pkg === undefined) throw new Error('sin paquetes');
  return pkg;
};

/** Paquete de una sola línea sobre un catálogo propio, para pruebas puntuales. */
const singleLine = (
  parameters: Record<string, unknown>,
  item: QuoteInputRaw['catalog'][number],
  line: QuoteInputRaw['packages'][number]['lines'][number],
  measurements: QuoteInputRaw['measurements'] = {
    sections: [{ areaSqFt: 100, areaKind: 'SURFACE', pitchRise: 0 }],
  },
) =>
  basicOf({
    measurements,
    catalog: [item],
    packages: [{ packageId: 'p', tier: 'BASIC', name: 'B', warranty: warranty(1), lines: [line] }],
    parameters: { wasteBps: 0, taxBps: 0, depositBps: 0, ...parameters } as never,
  });

const material = (id: string, unit: 'UNIT' | 'LINEAR_FT', price: number) =>
  ({
    id,
    name: id,
    kind: 'MATERIAL',
    unit,
    materialPriceCents: price,
    laborPriceCents: 0,
  }) as const;

const labor = (id: string, unit: 'SQUARE' | 'LINEAR_FT', price: number) =>
  ({
    id,
    name: id,
    kind: 'LABOR',
    unit,
    materialPriceCents: 0,
    laborPriceCents: price,
  }) as const;

describe('calculateQuote: caso completo de tres paquetes', () => {
  const result = calculateQuoteFromRaw(baseInput);

  it('resume el techo', () => {
    expect(result.roof).toEqual({ surfaceAreaSqFt: 3000, squares: 30 });
  });

  it('calcula las partidas del paquete Básico con la instantánea completa', () => {
    const [basic] = result.packages;
    expect(basic?.lines).toEqual([
      {
        sortOrder: 0,
        itemId: 'shingle-basic',
        sku: 'SH-B',
        name: 'Teja básica',
        kind: 'MATERIAL',
        unit: 'BUNDLE',
        quantity: 99,
        purchaseQuantity: 99,
        purchaseUnitName: null,
        unitMaterialPriceCents: 3000,
        unitLaborPriceCents: 0,
        lineMaterialCents: 297_000,
        lineLaborCents: 0,
        lineTotalCents: 297_000,
      },
      expect.objectContaining({
        sortOrder: 1,
        itemId: 'install',
        sku: null,
        kind: 'LABOR',
        quantity: 30,
        lineMaterialCents: 0,
        lineLaborCents: 300_000,
      }),
      expect.objectContaining({
        sortOrder: 2,
        itemId: 'underlayment',
        quantity: 40,
        purchaseQuantity: 4,
        purchaseUnitName: 'roll',
        lineMaterialCents: 32_000,
      }),
      expect.objectContaining({
        sortOrder: 3,
        itemId: 'drip-edge',
        quantity: 132,
        lineMaterialCents: 19_800,
        lineLaborCents: 13_200,
      }),
    ]);
  });

  it('calcula el paquete Básico', () => {
    expect(result.packages[0]).toMatchObject({
      packageId: 'basic-1',
      tier: 'BASIC',
      materialSubtotalCents: 348_800,
      laborSubtotalCents: 313_200,
      discountCents: 0,
      taxCents: 28_776,
      totalCents: 690_776,
      depositCents: 207_233,
      balanceCents: 483_543,
      warranty: { years: 10 },
    });
  });

  it('calcula el paquete Mejor (cumbrera con unidad de compra y cantidad fija)', () => {
    const better = result.packages[1];
    // 100 ft × 1.10 = 110 ft → 4 bundles de 30 ft = 120 ft facturados.
    expect(better?.lines[4]).toMatchObject({
      quantity: 120,
      purchaseQuantity: 4,
      lineMaterialCents: 18_000,
    });
    // Ventilaciones: FIXED, sin desperdicio.
    expect(better?.lines[5]).toMatchObject({
      quantity: 4,
      lineMaterialCents: 10_000,
      lineLaborCents: 20_000,
    });
    expect(better).toMatchObject({
      materialSubtotalCents: 376_800,
      laborSubtotalCents: 333_200,
      taxCents: 31_086,
      totalCents: 741_086,
      depositCents: 222_326,
      balanceCents: 518_760,
    });
  });

  it('calcula el paquete Premium', () => {
    expect(result.packages[2]).toMatchObject({
      tier: 'PREMIUM',
      materialSubtotalCents: 525_300,
      laborSubtotalCents: 333_200,
      taxCents: 43_337,
      totalCents: 901_837,
      depositCents: 270_551,
      balanceCents: 631_286,
    });
  });

  it('precio unitario × cantidad reproduce el importe de cada línea', () => {
    for (const pkg of result.packages) {
      for (const line of pkg.lines) {
        const milli = Math.round(line.quantity * 1000);
        expect(Math.floor((2 * milli * line.unitMaterialPriceCents + 1000) / 2000)).toBe(
          line.lineMaterialCents,
        );
        expect(Math.floor((2 * milli * line.unitLaborPriceCents + 1000) / 2000)).toBe(
          line.lineLaborCents,
        );
      }
    }
  });

  it('cumple las identidades de suma y solo usa enteros', () => {
    for (const pkg of result.packages) {
      expect(pkg.totalCents).toBe(
        pkg.materialSubtotalCents + pkg.laborSubtotalCents - pkg.discountCents + pkg.taxCents,
      );
      expect(pkg.depositCents + pkg.balanceCents).toBe(pkg.totalCents);
      expect(pkg.lines.reduce((sum, l) => sum + l.lineTotalCents, 0)).toBe(
        pkg.materialSubtotalCents + pkg.laborSubtotalCents,
      );
      for (const value of [
        pkg.totalCents,
        pkg.taxCents,
        pkg.depositCents,
        pkg.balanceCents,
        ...pkg.lines.flatMap((l) => [l.lineMaterialCents, l.lineLaborCents, l.lineTotalCents]),
      ]) {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });
});

describe('calculateQuote: varios paquetes por nivel', () => {
  it('acepta dos paquetes del mismo tier con distinto packageId', () => {
    const result = calculateQuoteFromRaw({
      ...baseInput,
      packages: [firstPackage, { ...firstPackage, packageId: 'basic-metal', name: 'Básico metal' }],
    });
    expect(result.packages.map((p) => [p.packageId, p.tier])).toEqual([
      ['basic-1', 'BASIC'],
      ['basic-metal', 'BASIC'],
    ]);
  });

  it('rechaza packageId duplicado con su path', () => {
    const error = parseError({ ...baseInput, packages: [firstPackage, { ...firstPackage }] });
    expect(error.issues[0]?.path).toEqual(['packages', 1, 'packageId']);
    expect(error.issues[0]?.code).toBe('custom');
    expect(error.issues[0]).toMatchObject({ params: { code: 'DUPLICATE_ID' } });
  });
});

describe('calculateQuote: impuesto', () => {
  it('por defecto grava solo el material', () => {
    expect(basicOf(baseInput).taxCents).toBe(28_776);
  });

  it('con taxAppliesToLabor grava material + mano de obra', () => {
    const pkg = basicOf(withParameters({ taxAppliesToLabor: true }));
    // (348 800 + 313 200) × 8.25 % = 54 615
    expect(pkg.taxCents).toBe(54_615);
    expect(pkg.totalCents).toBe(716_615);
  });

  it('taxAppliesToLabor false explícito equivale al valor por defecto', () => {
    expect(basicOf(withParameters({ taxAppliesToLabor: false })).taxCents).toBe(28_776);
  });

  it('el impuesto usa half-up en la mitad exacta', () => {
    const pkg = singleLine({ taxBps: 5000, depositBps: 5000 }, material('odd', 'UNIT', 1), {
      itemId: 'odd',
      quantityRule: 'FIXED',
      factor: 1,
    });
    expect(pkg.taxCents).toBe(1); // 0.5 ¢ → 1 ¢
    expect(pkg.totalCents).toBe(2);
    expect(pkg.depositCents).toBe(1);
    expect(pkg.balanceCents).toBe(1);
  });
});

describe('calculateQuote: descuento', () => {
  it('se aplica antes del impuesto y se reparte proporcionalmente', () => {
    const pkg = basicOf(withParameters({ discountBps: 1000 }));
    expect(pkg).toMatchObject({
      materialSubtotalCents: 348_800,
      laborSubtotalCents: 313_200,
      discountCents: 66_200,
      // base imponible: 348 800 − 34 880 = 313 920 → 25 898.4 → 25 898
      taxCents: 25_898,
      totalCents: 621_698,
      depositCents: 186_509,
      balanceCents: 435_189,
    });
  });

  it('con taxAppliesToLabor el impuesto grava material y mano de obra descontados', () => {
    const pkg = basicOf(withParameters({ discountBps: 1000, taxAppliesToLabor: true }));
    // (662 000 − 66 200) × 8.25 % = 49 153.5 → 49 154
    expect(pkg.taxCents).toBe(49_154);
    expect(pkg.totalCents).toBe(644_954);
  });

  it('descuento por defecto 0', () => {
    expect(basicOf(baseInput).discountCents).toBe(0);
  });
});

describe('calculateQuote: cantidades y redondeos', () => {
  it('convierte área en planta a real y usa 3 decimales en mano de obra', () => {
    const pkg = singleLine(
      {},
      labor('labor', 'SQUARE', 10_000),
      { itemId: 'labor', quantityRule: 'PER_SQUARE' },
      { sections: [{ areaSqFt: 2000, areaKind: 'PLAN', pitchRise: 6 }] },
    );
    // 2000 × sqrt(1.25) / 100 = 22.360679… → 22.361 squares
    expect(pkg.lines[0]?.quantity).toBe(22.361);
    expect(pkg.lines[0]?.lineLaborCents).toBe(223_610);
  });

  it('suma varias secciones con pendientes de 0/12 a 12/12', () => {
    const sections = [0, 3, 6, 9, 12].map((pitchRise) => ({
      areaSqFt: 1000,
      areaKind: 'PLAN' as const,
      pitchRise,
    }));
    const result = calculateQuoteFromRaw({ ...baseInput, measurements: { sections } });
    const expected = sections.reduce(
      (sum, s) => sum + 1000 * Math.sqrt(1 + (s.pitchRise / 12) ** 2),
      0,
    );
    expect(result.roof.surfaceAreaSqFt).toBeCloseTo(expected, 9);
  });

  it('el material se redondea hacia arriba a unidades de compra', () => {
    const line = basicOf(baseInput).lines[2];
    // 30 squares + 10 % = 33 → 3.3 rollos → 4 rollos de 10 squares
    expect(line?.purchaseQuantity).toBe(4);
    expect(line?.quantity).toBe(40);
  });

  it('sin unidad de compra redondea hacia arriba a la unidad base entera', () => {
    const pkg = singleLine(
      {},
      material('d', 'LINEAR_FT', 100),
      { itemId: 'd', quantityRule: 'PER_LINEAR_FT_EAVE' },
      { sections: [{ areaSqFt: 100, areaKind: 'SURFACE', pitchRise: 0 }], eavesFt: 10.2 },
    );
    expect(pkg.lines[0]?.quantity).toBe(11);
    expect(pkg.lines[0]?.purchaseUnitName).toBeNull();
  });

  it('el factor multiplica la medida y la mano de obra no lleva desperdicio', () => {
    const pkg = singleLine(
      { wasteBps: 5000 },
      labor('l', 'LINEAR_FT', 100),
      { itemId: 'l', quantityRule: 'PER_LINEAR_FT_RIDGE', factor: 1.5 },
      { sections: [{ areaSqFt: 100, areaKind: 'SURFACE', pitchRise: 0 }], ridgeFt: 10 },
    );
    expect(pkg.lines[0]?.quantity).toBe(15);
    expect(pkg.lines[0]?.lineLaborCents).toBe(1500);
  });

  it('con anticipo del 100 % el saldo es cero', () => {
    const pkg = basicOf(withParameters({ depositBps: 10_000 }));
    expect(pkg.depositCents).toBe(pkg.totalCents);
    expect(pkg.balanceCents).toBe(0);
  });

  it('usa 0 para longitudes lineales omitidas', () => {
    const pkg = calculateQuoteFromRaw({
      ...baseInput,
      measurements: { sections: [{ areaSqFt: 3000, areaKind: 'SURFACE', pitchRise: 6 }] },
    }).packages[1];
    expect(pkg?.lines[2]?.quantity).toBe(40);
    expect(pkg?.lines[3]?.quantity).toBe(0);
    expect(pkg?.lines[4]?.quantity).toBe(0);
  });

  it.each([
    ['PER_LINEAR_FT_RIDGE', { ridgeFt: 50 }, 50],
    ['PER_LINEAR_FT_EAVE', { eavesFt: 70 }, 70],
    ['PER_LINEAR_FT_HIP', { hipsFt: 30 }, 30],
    ['PER_LINEAR_FT_VALLEY', { valleysFt: 25 }, 25],
    ['PER_LINEAR_FT_GUTTER', { guttersFt: 90 }, 90],
  ] as const)('usa la medida correcta para %s', (quantityRule, extra, expected) => {
    const pkg = singleLine(
      {},
      material('x', 'LINEAR_FT', 100),
      { itemId: 'x', quantityRule },
      { sections: [{ areaSqFt: 100, areaKind: 'SURFACE', pitchRise: 0 }], ...extra },
    );
    expect(pkg.lines[0]?.quantity).toBe(expected);
  });
});

describe('coherencia de la entrada (superRefine)', () => {
  it('rechaza un itemId repetido dentro del mismo paquete', () => {
    const error = parseError({
      ...baseInput,
      packages: [{ ...firstPackage, lines: [...firstPackage.lines, firstPackage.lines[0]] }],
    });
    expect(error.issues[0]?.path).toEqual(['packages', 0, 'lines', 4, 'itemId']);
    expect(error.issues[0]).toMatchObject({ code: 'custom', params: { code: 'DUPLICATE_ID' } });
  });

  it('artículo inexistente: código y path', () => {
    const error = parseError({
      ...baseInput,
      packages: [{ ...firstPackage, lines: [{ itemId: 'no-existe', quantityRule: 'PER_SQUARE' }] }],
    });
    expect(error.issues[0]?.path).toEqual(['packages', 0, 'lines', 0, 'itemId']);
    expect(error.issues[0]).toMatchObject({ code: 'custom', params: { code: 'UNKNOWN_ITEM' } });
  });

  it('regla FIXED sin factor: código y path', () => {
    const error = parseError({
      ...baseInput,
      packages: [
        {
          ...firstPackage,
          lines: [
            { itemId: 'install', quantityRule: 'PER_SQUARE' },
            { itemId: 'vent', quantityRule: 'FIXED' },
          ],
        },
      ],
    });
    expect(error.issues[0]?.path).toEqual(['packages', 0, 'lines', 1, 'factor']);
    expect(error.issues[0]).toMatchObject({ params: { code: 'MISSING_FACTOR' } });
  });

  it('calculateQuote defiende también las entradas sin validar', () => {
    const parsed = quoteInputSchema.parse(baseInput);
    const unknownItem: QuoteInput = {
      ...parsed,
      packages: [{ ...firstPackage, lines: [{ itemId: 'zz', quantityRule: 'PER_SQUARE' }] }],
    };
    expect(() => calculateQuote(unknownItem)).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_ITEM' }),
    );
    const noFactor: QuoteInput = {
      ...parsed,
      packages: [{ ...firstPackage, lines: [{ itemId: 'vent', quantityRule: 'FIXED' }] }],
    };
    expect(() => calculateQuote(noFactor)).toThrow(
      expect.objectContaining({ code: 'MISSING_FACTOR' }),
    );
  });

  it('calculateQuote acepta la entrada ya validada', () => {
    expect(calculateQuote(quoteInputSchema.parse(baseInput))).toEqual(
      calculateQuoteFromRaw(baseInput),
    );
  });

  it('artículo de mano de obra con material o unidad de compra: path', () => {
    const install = catalog[2];
    if (install === undefined) throw new Error('fixture');
    let error = parseError({ ...baseInput, catalog: [{ ...install, materialPriceCents: 5 }] });
    expect(error.issues[0]?.path).toEqual(['catalog', 0, 'materialPriceCents']);
    error = parseError({
      ...baseInput,
      catalog: [{ ...install, purchaseUnit: { name: 'x', baseUnitsPerPurchaseUnit: 1 } }],
    });
    expect(error.issues[0]?.path).toEqual(['catalog', 0, 'purchaseUnit']);
    expect(error.issues[0]).toMatchObject({ params: { code: 'INVALID_ITEM' } });
  });

  it('catálogo con id duplicado: path', () => {
    const item = catalog[0];
    if (item === undefined) throw new Error('fixture');
    const error = parseError({ ...baseInput, catalog: [item, { ...item }] });
    expect(error.issues[0]?.path).toEqual(['catalog', 1, 'id']);
    expect(error.issues[0]).toMatchObject({ params: { code: 'DUPLICATE_ID' } });
  });
});

describe('límites y desbordes', () => {
  const mutate = (fn: (input: Record<string, any>) => void): ZodError => {
    const input = structuredClone(baseInput) as Record<string, any>;
    fn(input);
    return parseError(input);
  };
  const firstIssue = (error: ZodError) => ({
    path: error.issues[0]?.path,
    code: error.issues[0]?.code,
  });

  it('rechaza áreas y longitudes sobre el tope', () => {
    expect(firstIssue(mutate((i) => (i.measurements.sections[0].areaSqFt = 1_000_001)))).toEqual({
      path: ['measurements', 'sections', 0, 'areaSqFt'],
      code: 'too_big',
    });
    expect(firstIssue(mutate((i) => (i.measurements.ridgeFt = 100_001)))).toEqual({
      path: ['measurements', 'ridgeFt'],
      code: 'too_big',
    });
  });

  it('rechaza más de 100 secciones', () => {
    const error = mutate(
      (i) =>
        (i.measurements.sections = Array.from({ length: 101 }, () => ({
          areaSqFt: 3000,
          areaKind: 'SURFACE',
          pitchRise: 6,
        }))),
    );
    expect(firstIssue(error)).toEqual({ path: ['measurements', 'sections'], code: 'too_big' });
  });

  it('rechaza precios, factor y unidades de compra sobre el tope', () => {
    expect(firstIssue(mutate((i) => (i.catalog[0].materialPriceCents = 10_000_001)))).toEqual({
      path: ['catalog', 0, 'materialPriceCents'],
      code: 'too_big',
    });
    expect(firstIssue(mutate((i) => (i.packages[0].lines[0].factor = 10_001)))).toEqual({
      path: ['packages', 0, 'lines', 0, 'factor'],
      code: 'too_big',
    });
    expect(
      firstIssue(mutate((i) => (i.catalog[3].purchaseUnit.baseUnitsPerPurchaseUnit = 1_000_001))),
    ).toEqual({
      path: ['catalog', 3, 'purchaseUnit', 'baseUnitsPerPurchaseUnit'],
      code: 'too_big',
    });
  });

  it('rechaza factor o unidades por paquete cero o negativos', () => {
    expect(firstIssue(mutate((i) => (i.packages[0].lines[0].factor = 0))).code).toBe('too_small');
    expect(
      firstIssue(mutate((i) => (i.catalog[3].purchaseUnit.baseUnitsPerPurchaseUnit = -1))).code,
    ).toBe('too_small');
  });

  it('lanza AMOUNT_EXCEEDS_INT4 si un importe pasa de 2 147 483 647', () => {
    const input = structuredClone(baseInput) as Record<string, any>;
    input.measurements.sections = Array.from({ length: 20 }, () => ({
      areaSqFt: 1_000_000,
      areaKind: 'SURFACE',
      pitchRise: 0,
    }));
    expect(() => calculateQuoteFromRaw(input)).toThrow(QuoteCalculationError);
    expect(() => calculateQuoteFromRaw(input)).toThrow(
      expect.objectContaining({ code: 'AMOUNT_EXCEEDS_INT4' }),
    );
  });

  it('lanza AMOUNT_NOT_SAFE_INTEGER si el cálculo pierde precisión entera', () => {
    const input = structuredClone(baseInput) as Record<string, any>;
    input.measurements.sections = Array.from({ length: 100 }, () => ({
      areaSqFt: 1_000_000,
      areaKind: 'SURFACE',
      pitchRise: 24,
    }));
    input.catalog[0].materialPriceCents = 10_000_000;
    input.packages[0].lines[0].factor = 10_000;
    expect(() => calculateQuoteFromRaw(input)).toThrow(
      expect.objectContaining({ code: 'AMOUNT_NOT_SAFE_INTEGER' }),
    );
  });

  it('lanza QUANTITY_OUT_OF_RANGE si quantity no cabe en Numeric(12,3)', () => {
    const input = structuredClone(baseInput) as Record<string, any>;
    input.measurements.sections = Array.from({ length: 100 }, () => ({
      areaSqFt: 1_000_000,
      areaKind: 'SURFACE',
      pitchRise: 0,
    }));
    input.catalog = [material('free', 'UNIT', 0)];
    input.packages = [
      {
        packageId: 'p',
        tier: 'BASIC',
        name: 'B',
        warranty: warranty(1),
        lines: [{ itemId: 'free', quantityRule: 'PER_SQUARE', factor: 5000 }],
      },
    ];
    expect(() => calculateQuoteFromRaw(input)).toThrow(
      expect.objectContaining({ code: 'QUANTITY_OUT_OF_RANGE' }),
    );
  });

  it('lanza QUANTITY_OUT_OF_RANGE si purchaseQuantity no cabe aunque quantity sí', () => {
    const input = structuredClone(baseInput) as Record<string, any>;
    input.measurements.sections = Array.from({ length: 100 }, () => ({
      areaSqFt: 1_000_000,
      areaKind: 'SURFACE',
      pitchRise: 0,
    }));
    input.parameters.wasteBps = 0;
    input.catalog = [
      {
        ...material('free', 'UNIT', 0),
        purchaseUnit: { name: 'tiny', baseUnitsPerPurchaseUnit: 0.001 },
      },
    ];
    input.packages = [
      {
        packageId: 'p',
        tier: 'BASIC',
        name: 'B',
        warranty: warranty(1),
        lines: [{ itemId: 'free', quantityRule: 'PER_SQUARE', factor: 500 }],
      },
    ];
    // quantity = 5e8 (cabe) pero purchaseQuantity = 5e11.
    expect(() => calculateQuoteFromRaw(input)).toThrow(
      expect.objectContaining({ code: 'QUANTITY_OUT_OF_RANGE' }),
    );
  });

  it('rechaza decimales que Numeric(10,4) y Numeric(10,3) no pueden guardar', () => {
    expect(firstIssue(mutate((i) => (i.packages[0].lines[0].factor = 1.00005)))).toEqual({
      path: ['packages', 0, 'lines', 0, 'factor'],
      code: 'not_multiple_of',
    });
    expect(
      firstIssue(mutate((i) => (i.catalog[3].purchaseUnit.baseUnitsPerPurchaseUnit = 0.0005))),
    ).toEqual({
      path: ['catalog', 3, 'purchaseUnit', 'baseUnitsPerPurchaseUnit'],
      code: 'not_multiple_of',
    });
  });

  it('acepta los decimales máximos del modelo', () => {
    const input = structuredClone(baseInput) as Record<string, any>;
    input.packages[0].lines[0].factor = 3.0001;
    input.catalog[3].purchaseUnit.baseUnitsPerPurchaseUnit = 10.001;
    expect(() => calculateQuoteFromRaw(input)).not.toThrow();
  });

  it('acepta un importe justo por debajo del límite INT4', () => {
    const pkg = singleLine({}, material('u', 'UNIT', 10_000_000), {
      itemId: 'u',
      quantityRule: 'FIXED',
      factor: 214,
    });
    expect(pkg.totalCents).toBe(2_140_000_000);
  });
});

describe('validación Zod de la entrada', () => {
  const rejects = (mutate: (input: Record<string, any>) => void) => {
    const input = structuredClone(baseInput) as Record<string, any>;
    mutate(input);
    expect(() => calculateQuoteFromRaw(input)).toThrow(ZodError);
  };

  it('acepta la entrada base y aplica los valores por defecto', () => {
    const parsed = quoteInputSchema.parse(baseInput);
    expect(parsed.parameters).toMatchObject({ taxAppliesToLabor: false, discountBps: 0 });
    expect(parsed.catalog[1]?.sku).toBeNull();
  });

  it('rechaza claves desconocidas en parámetros (p. ej. markupBps)', () => {
    const error = parseError(withParameters({ markupBps: 2000 }));
    expect(error.issues[0]?.code).toBe('unrecognized_keys');
    expect(error.issues[0]?.path).toEqual(['parameters']);
  });

  it('rechaza techo sin secciones', () => rejects((i) => (i.measurements.sections = [])));
  it('rechaza área cero, negativa o no finita', () => {
    rejects((i) => (i.measurements.sections[0].areaSqFt = 0));
    rejects((i) => (i.measurements.sections[0].areaSqFt = -5));
    rejects((i) => (i.measurements.sections[0].areaSqFt = Number.NaN));
    rejects((i) => (i.measurements.ridgeFt = Number.POSITIVE_INFINITY));
  });
  it('rechaza pendiente fuera de rango', () => {
    rejects((i) => (i.measurements.sections[0].pitchRise = -1));
    rejects((i) => (i.measurements.sections[0].pitchRise = 25));
  });
  it('rechaza longitudes negativas', () => rejects((i) => (i.measurements.guttersFt = -1)));
  it('rechaza tipos de área, unidades, tipos o reglas desconocidos', () => {
    rejects((i) => (i.measurements.sections[0].areaKind = 'plan'));
    rejects((i) => (i.catalog[0].unit = 'GALON'));
    rejects((i) => (i.catalog[0].kind = 'OTRO'));
    rejects((i) => (i.packages[0].tier = 'GOLD'));
    rejects((i) => (i.packages[0].lines[0].quantityRule = 'PER_ROOM'));
  });
  it('rechaza precios no enteros o negativos', () => {
    rejects((i) => (i.catalog[0].materialPriceCents = 10.5));
    rejects((i) => (i.catalog[0].laborPriceCents = -1));
  });
  it('rechaza paquetes vacíos o sin líneas', () => {
    rejects((i) => (i.packages = []));
    rejects((i) => (i.packages[0].lines = []));
  });
  it('rechaza garantía con años negativos, no enteros o excesivos', () => {
    rejects((i) => (i.packages[0].warranty.years = -1));
    rejects((i) => (i.packages[0].warranty.years = 1.5));
    rejects((i) => (i.packages[0].warranty.years = 101));
  });
  it('rechaza parámetros fuera de rango o no enteros', () => {
    rejects((i) => (i.parameters.wasteBps = -1));
    rejects((i) => (i.parameters.taxBps = 10_001));
    rejects((i) => (i.parameters.depositBps = 12.5));
    rejects((i) => (i.parameters.discountBps = 10_001));
    rejects((i) => (i.parameters.taxAppliesToLabor = 'si'));
  });
  it('rechaza entradas que no son objetos', () => {
    expect(() => calculateQuoteFromRaw(null)).toThrow(ZodError);
    expect(() => calculateQuoteFromRaw({})).toThrow(ZodError);
  });
});
