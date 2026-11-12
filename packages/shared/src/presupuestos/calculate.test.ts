import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { calculateQuote, calculateQuoteFromRaw, QuoteCalculationError } from './calculate.js';
import { quoteInputSchema, type QuoteInputRaw } from './schemas.js';

// Datos de EJEMPLO solo para pruebas: no son precios ni porcentajes del negocio.
const catalog: QuoteInputRaw['catalog'] = [
  {
    id: 'shingle-basic',
    name: 'Teja básica',
    category: 'shingles',
    unit: 'square',
    quantityBasis: 'roof_squares',
    purchaseUnit: { kind: 'packages_per_unit', label: 'bundle', count: 3 },
    materialPriceCents: 3000,
    laborPerUnitCents: 10_000,
    appliesWaste: true,
  },
  {
    id: 'shingle-premium',
    name: 'Teja premium',
    category: 'shingles',
    unit: 'square',
    quantityBasis: 'roof_squares',
    purchaseUnit: { kind: 'packages_per_unit', label: 'bundle', count: 3 },
    materialPriceCents: 4500,
    laborPerUnitCents: 10_000,
    appliesWaste: true,
  },
  {
    id: 'underlayment',
    name: 'Membrana',
    category: 'underlayment',
    unit: 'square',
    quantityBasis: 'roof_squares',
    purchaseUnit: { kind: 'units_per_package', label: 'roll', count: 10 },
    materialPriceCents: 8000,
    laborPerUnitCents: 0,
    appliesWaste: true,
  },
  {
    id: 'ridge-cap',
    name: 'Cumbrera',
    category: 'ridge_cap',
    unit: 'linear_foot',
    quantityBasis: 'ridge_and_hips_ft',
    purchaseUnit: { kind: 'units_per_package', label: 'bundle', count: 33 },
    materialPriceCents: 4500,
    laborPerUnitCents: 200,
    appliesWaste: false,
  },
  {
    id: 'drip-edge',
    name: 'Gotero',
    category: 'flashing',
    unit: 'linear_foot',
    quantityBasis: 'eaves_ft',
    materialPriceCents: 150,
    laborPerUnitCents: 100,
    appliesWaste: true,
  },
  {
    id: 'vent',
    name: 'Ventilación',
    category: 'ventilation',
    unit: 'each',
    quantityBasis: 'fixed',
    materialPriceCents: 2500,
    laborPerUnitCents: 5000,
    appliesWaste: false,
  },
];

const warranty = (years: number) => ({ text: `Garantía de ejemplo ${years} años`, years });

const baseInput: QuoteInputRaw = {
  measurements: {
    sections: [{ areaSqFt: 3000, areaKind: 'surface', pitchRise: 6 }],
    ridgeFt: 60,
    hipsFt: 40,
    eavesFt: 120,
  },
  catalog,
  packages: [
    {
      tier: 'basic',
      name: 'Básico',
      warranty: warranty(10),
      lines: [{ itemId: 'shingle-basic' }, { itemId: 'underlayment' }, { itemId: 'drip-edge' }],
    },
    {
      tier: 'better',
      name: 'Mejor',
      warranty: warranty(20),
      lines: [
        { itemId: 'shingle-basic' },
        { itemId: 'underlayment' },
        { itemId: 'drip-edge' },
        { itemId: 'ridge-cap' },
        { itemId: 'vent', fixedQuantity: 4 },
      ],
    },
    {
      tier: 'premium',
      name: 'Premium',
      warranty: warranty(30),
      lines: [
        { itemId: 'shingle-premium' },
        { itemId: 'underlayment' },
        { itemId: 'drip-edge' },
        { itemId: 'ridge-cap' },
        { itemId: 'vent', fixedQuantity: 4 },
      ],
    },
  ],
  parameters: { wasteBps: 1000, materialTaxBps: 825, markupBps: 2000, depositBps: 3000 },
};

const withParameters = (parameters: Partial<QuoteInputRaw['parameters']>): QuoteInputRaw => ({
  ...baseInput,
  parameters: { ...baseInput.parameters, ...parameters },
});

const single = (input: QuoteInputRaw, tier: 'basic' | 'better' | 'premium' = 'basic') => {
  const pkg = calculateQuoteFromRaw(input).packages.find((p) => p.tier === tier);
  if (pkg === undefined) throw new Error('paquete no encontrado');
  return pkg;
};

describe('calculateQuote: caso completo de tres paquetes', () => {
  const result = calculateQuoteFromRaw(baseInput);

  it('resume el techo', () => {
    expect(result.roof.surfaceAreaSqFt).toBe(3000);
    expect(result.roof.squares).toBe(30);
    expect(result.roof.squaresWithWaste).toBeCloseTo(33, 9);
  });

  it('calcula el paquete Básico', () => {
    const [basic] = result.packages;
    expect(basic?.tier).toBe('basic');
    expect(basic?.lines.map((l) => l.purchasedQuantity)).toEqual([99, 4, 132]);
    expect(basic?.lines.map((l) => l.totalCents)).toEqual([716_400, 38_400, 38_160]);
    expect(basic).toMatchObject({
      materialSubtotalCents: 418_560,
      laborSubtotalCents: 374_400,
      taxCents: 34_531,
      totalCents: 827_491,
      depositCents: 248_247,
      balanceCents: 579_244,
      warranty: { years: 10 },
    });
  });

  it('calcula el paquete Mejor', () => {
    const better = result.packages[1];
    expect(better).toMatchObject({
      tier: 'better',
      materialSubtotalCents: 452_160,
      laborSubtotalCents: 422_400,
      taxCents: 37_303,
      totalCents: 911_863,
      depositCents: 273_559,
      balanceCents: 638_304,
    });
  });

  it('calcula el paquete Premium con anticipo en la mitad exacta (half-up)', () => {
    const premium = result.packages[2];
    expect(premium).toMatchObject({
      tier: 'premium',
      materialSubtotalCents: 630_360,
      laborSubtotalCents: 422_400,
      taxCents: 52_005,
      totalCents: 1_104_765,
      depositCents: 331_430,
      balanceCents: 773_335,
    });
  });

  it('cumple las identidades de suma y solo usa enteros', () => {
    for (const pkg of result.packages) {
      expect(pkg.totalCents).toBe(
        pkg.materialSubtotalCents + pkg.laborSubtotalCents + pkg.taxCents,
      );
      expect(pkg.depositCents + pkg.balanceCents).toBe(pkg.totalCents);
      expect(pkg.lines.reduce((sum, l) => sum + l.totalCents, 0)).toBe(
        pkg.materialSubtotalCents + pkg.laborSubtotalCents,
      );
      for (const value of [
        pkg.materialSubtotalCents,
        pkg.laborSubtotalCents,
        pkg.taxCents,
        pkg.totalCents,
        pkg.depositCents,
        pkg.balanceCents,
        ...pkg.lines.flatMap((l) => [l.materialCents, l.laborCents, l.totalCents]),
      ]) {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it('ordena los paquetes Básico < Mejor < Premium en total', () => {
    const totals = result.packages.map((p) => p.totalCents);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
  });
});

describe('calculateQuote: cantidades y redondeos', () => {
  it('convierte área en planta a real y la usa para squares y mano de obra', () => {
    const pkg = single({
      ...withParameters({ wasteBps: 0, materialTaxBps: 0, markupBps: 0, depositBps: 0 }),
      measurements: { sections: [{ areaSqFt: 2000, areaKind: 'plan', pitchRise: 6 }] },
      packages: [
        {
          tier: 'basic',
          name: 'Básico',
          warranty: warranty(5),
          lines: [{ itemId: 'shingle-basic' }],
        },
      ],
    });
    const [line] = pkg.lines;
    // 2000 × sqrt(1.25) / 100 = 22.36068 squares → 67.08 bundles → 68.
    expect(line?.measuredQuantity).toBe(22.36068);
    expect(line?.purchasedQuantity).toBe(68);
    expect(line?.materialCents).toBe(68 * 3000);
    expect(line?.laborCents).toBe(223_607);
    expect(pkg.depositCents).toBe(0);
    expect(pkg.balanceCents).toBe(pkg.totalCents);
  });

  it('suma varias secciones con pendientes de 0/12 a 12/12', () => {
    const sections = [0, 3, 6, 9, 12].map((pitchRise) => ({
      areaSqFt: 1000,
      areaKind: 'plan' as const,
      pitchRise,
    }));
    const result = calculateQuoteFromRaw({
      ...baseInput,
      measurements: { sections },
    });
    const expected = sections.reduce(
      (sum, s) => sum + 1000 * Math.sqrt(1 + (s.pitchRise / 12) ** 2),
      0,
    );
    expect(result.roof.surfaceAreaSqFt).toBeCloseTo(expected, 9);
  });

  it('no compra una unidad de más por ruido de coma flotante', () => {
    // 30 squares + 10 % = 33 squares exactos (sin ruido de coma flotante).
    const line = single(baseInput).lines[1];
    expect(line?.purchasedQuantity).toBe(4);
    expect(single(baseInput).lines[0]?.purchasedQuantity).toBe(99);
    expect(single(baseInput).lines[2]?.purchasedQuantity).toBe(132);
  });

  it('sin unidad de compra redondea hacia arriba a la unidad de medida entera', () => {
    const pkg = single(
      {
        ...withParameters({ wasteBps: 0, markupBps: 0, materialTaxBps: 0 }),
        measurements: {
          sections: [{ areaSqFt: 100, areaKind: 'surface', pitchRise: 0 }],
          eavesFt: 10.2,
        },
      },
      'basic',
    );
    expect(pkg.lines[2]?.purchasedQuantity).toBe(11);
    expect(pkg.lines[2]?.purchaseUnitLabel).toBeNull();
    expect(pkg.lines[0]?.purchaseUnitLabel).toBe('bundle');
  });

  it('no aplica desperdicio a artículos que no lo usan', () => {
    const pkg = single(baseInput, 'better');
    // 100 ft de cumbrera+limatesas / 33 ft por paquete = 3.03 → 4 (sin desperdicio).
    expect(pkg.lines[3]?.purchasedQuantity).toBe(4);
    expect(pkg.lines[3]?.measuredQuantity).toBe(100);
    // 4 ventilaciones fijas sin desperdicio.
    expect(pkg.lines[4]?.purchasedQuantity).toBe(4);
  });

  it('aplica el recargo y el impuesto con half-up por partida', () => {
    const pkg = single({
      ...withParameters({ markupBps: 0, materialTaxBps: 5000, depositBps: 5000, wasteBps: 0 }),
      measurements: { sections: [{ areaSqFt: 100, areaKind: 'surface', pitchRise: 0 }] },
      catalog: [
        {
          id: 'odd',
          name: 'Artículo impar',
          category: 'other',
          unit: 'each',
          quantityBasis: 'fixed',
          materialPriceCents: 1,
          laborPerUnitCents: 0,
          appliesWaste: false,
        },
      ],
      packages: [
        {
          tier: 'basic',
          name: 'B',
          warranty: warranty(1),
          lines: [{ itemId: 'odd', fixedQuantity: 1 }],
        },
      ],
    });
    // Impuesto: 0.5 ¢ → 1 ¢. Total 2 ¢. Anticipo 1 ¢.
    expect(pkg.taxCents).toBe(1);
    expect(pkg.totalCents).toBe(2);
    expect(pkg.depositCents).toBe(1);
    expect(pkg.balanceCents).toBe(1);
  });

  it('con anticipo del 100 % el saldo es cero', () => {
    const pkg = single(withParameters({ depositBps: 10_000 }));
    expect(pkg.depositCents).toBe(pkg.totalCents);
    expect(pkg.balanceCents).toBe(0);
  });

  it('usa 0 para longitudes lineales omitidas', () => {
    const pkg = single(
      {
        ...baseInput,
        measurements: { sections: [{ areaSqFt: 3000, areaKind: 'surface', pitchRise: 6 }] },
      },
      'better',
    );
    expect(pkg.lines[2]?.purchasedQuantity).toBe(0);
    expect(pkg.lines[3]?.purchasedQuantity).toBe(0);
    expect(pkg.lines[2]?.totalCents).toBe(0);
  });

  it.each([
    ['ridge_ft', { ridgeFt: 50 }, 50],
    ['eaves_ft', { eavesFt: 70 }, 70],
    ['hips_ft', { hipsFt: 30 }, 30],
    ['valleys_ft', { valleysFt: 25 }, 25],
    ['gutters_ft', { guttersFt: 90 }, 90],
  ] as const)('usa la medida correcta para %s', (quantityBasis, extra, expected) => {
    const pkg = single({
      ...withParameters({ wasteBps: 0 }),
      measurements: {
        sections: [{ areaSqFt: 100, areaKind: 'surface', pitchRise: 0 }],
        ...extra,
      },
      catalog: [
        {
          id: 'x',
          name: 'X',
          category: 'other',
          unit: 'linear_foot',
          quantityBasis,
          materialPriceCents: 100,
          laborPerUnitCents: 0,
          appliesWaste: true,
        },
      ],
      packages: [{ tier: 'basic', name: 'B', warranty: warranty(1), lines: [{ itemId: 'x' }] }],
    });
    expect(pkg.lines[0]?.measuredQuantity).toBe(expected);
  });
});

describe('calculateQuote: errores de coherencia', () => {
  it('rechaza un paquete que referencia un artículo inexistente', () => {
    const input: QuoteInputRaw = {
      ...baseInput,
      packages: [
        { tier: 'basic', name: 'B', warranty: warranty(1), lines: [{ itemId: 'no-existe' }] },
      ],
    };
    expect(() => calculateQuoteFromRaw(input)).toThrow(QuoteCalculationError);
    expect(() => calculateQuoteFromRaw(input)).toThrow(/no-existe/);
  });

  it('rechaza un artículo de cantidad fija sin fixedQuantity', () => {
    const input: QuoteInputRaw = {
      ...baseInput,
      packages: [{ tier: 'basic', name: 'B', warranty: warranty(1), lines: [{ itemId: 'vent' }] }],
    };
    expect(() => calculateQuoteFromRaw(input)).toThrow(QuoteCalculationError);
  });

  it('calculateQuote acepta la entrada ya validada', () => {
    const parsed = quoteInputSchema.parse(baseInput);
    expect(calculateQuote(parsed)).toEqual(calculateQuoteFromRaw(baseInput));
  });
});

describe('validación Zod de la entrada', () => {
  const clone = (): Record<string, unknown> => structuredClone(baseInput) as never;
  // Los casos inválidos mutan el JSON de entrada a propósito: se tipa de forma laxa solo aquí.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rejects = (mutate: (input: Record<string, any>) => void) => {
    const input = clone();
    mutate(input);
    expect(() => calculateQuoteFromRaw(input)).toThrow(ZodError);
  };

  it('acepta la entrada base', () => {
    expect(quoteInputSchema.safeParse(baseInput).success).toBe(true);
  });

  it('rechaza techo sin secciones', () => rejects((i) => (i.measurements.sections = [])));
  it('rechaza área cero o negativa', () => {
    rejects((i) => (i.measurements.sections[0].areaSqFt = 0));
    rejects((i) => (i.measurements.sections[0].areaSqFt = -5));
  });
  it('rechaza área o longitud no finita', () => {
    rejects((i) => (i.measurements.sections[0].areaSqFt = Number.NaN));
    rejects((i) => (i.measurements.ridgeFt = Number.POSITIVE_INFINITY));
  });
  it('rechaza pendiente fuera de rango', () => {
    rejects((i) => (i.measurements.sections[0].pitchRise = -1));
    rejects((i) => (i.measurements.sections[0].pitchRise = 25));
  });
  it('rechaza longitudes negativas', () => rejects((i) => (i.measurements.guttersFt = -1)));
  it('rechaza tipo de área desconocido', () =>
    rejects((i) => (i.measurements.sections[0].areaKind = 'otro')));
  it('rechaza precios no enteros o negativos', () => {
    rejects((i) => (i.catalog[0].materialPriceCents = 10.5));
    rejects((i) => (i.catalog[0].laborPerUnitCents = -1));
  });
  it('rechaza unidades o categorías desconocidas', () => {
    rejects((i) => (i.catalog[0].unit = 'galon'));
    rejects((i) => (i.catalog[0].category = 'x'));
  });
  it('rechaza unidad de compra inválida', () => {
    rejects((i) => (i.catalog[0].purchaseUnit.count = 0));
    rejects((i) => (i.catalog[0].purchaseUnit.kind = 'otra'));
  });
  it('rechaza artículos duplicados en el catálogo', () =>
    rejects((i) => i.catalog.push({ ...i.catalog[0] })));
  it('rechaza paquetes duplicados, vacíos o sin líneas', () => {
    rejects((i) => i.packages.push({ ...i.packages[0] }));
    rejects((i) => (i.packages = []));
    rejects((i) => (i.packages[0].lines = []));
  });
  it('rechaza garantía con años negativos o no enteros', () => {
    rejects((i) => (i.packages[0].warranty.years = -1));
    rejects((i) => (i.packages[0].warranty.years = 1.5));
  });
  it('rechaza parámetros fuera de rango o no enteros', () => {
    rejects((i) => (i.parameters.wasteBps = -1));
    rejects((i) => (i.parameters.materialTaxBps = 10_001));
    rejects((i) => (i.parameters.depositBps = 12.5));
    rejects((i) => (i.parameters.markupBps = 100_001));
  });
  it('rechaza entradas que no son objetos', () => {
    expect(() => calculateQuoteFromRaw(null)).toThrow(ZodError);
    expect(() => calculateQuoteFromRaw({})).toThrow(ZodError);
  });
});
