import { describe, expect, it } from 'vitest';
import { pitchFactor, summarizeRoof } from './geometry.js';
import { roofMeasurementsSchema, type RoofMeasurementsInput } from './schemas.js';

const measure = (input: RoofMeasurementsInput) => roofMeasurementsSchema.parse(input);

describe('pitchFactor', () => {
  it('vale 1 con pendiente 0/12', () => {
    expect(pitchFactor(0)).toBe(1);
  });

  it('usa sqrt(1 + (rise/12)²)', () => {
    expect(pitchFactor(6)).toBeCloseTo(Math.sqrt(1.25), 12);
    expect(pitchFactor(9)).toBeCloseTo(1.25, 12);
  });

  it('vale raíz de 2 con pendiente 12/12', () => {
    expect(pitchFactor(12)).toBeCloseTo(Math.SQRT2, 12);
  });

  it('crece de forma monótona entre 0/12 y 12/12', () => {
    for (let rise = 1; rise <= 12; rise += 1) {
      expect(pitchFactor(rise)).toBeGreaterThan(pitchFactor(rise - 1));
    }
  });
});

describe('summarizeRoof', () => {
  it('convierte área en planta a real con la pendiente', () => {
    const roof = summarizeRoof(
      measure({ sections: [{ areaSqFt: 1000, areaKind: 'plan', pitchRise: 12 }] }),
      0,
    );
    expect(roof.surfaceAreaSqFt).toBeCloseTo(1000 * Math.SQRT2, 9);
    expect(roof.squares).toBeCloseTo(14.142135623, 8);
    expect(roof.squaresWithWaste).toBeCloseTo(roof.squares, 12);
  });

  it('no modifica el área ya declarada como real', () => {
    const roof = summarizeRoof(
      measure({ sections: [{ areaSqFt: 1250, areaKind: 'surface', pitchRise: 8 }] }),
      0,
    );
    expect(roof.surfaceAreaSqFt).toBe(1250);
    expect(roof.squares).toBe(12.5);
  });

  it('suma varias secciones con pendientes y tipos distintos', () => {
    const roof = summarizeRoof(
      measure({
        sections: [
          { areaSqFt: 1000, areaKind: 'plan', pitchRise: 6 },
          { areaSqFt: 500, areaKind: 'plan', pitchRise: 0 },
          { areaSqFt: 300, areaKind: 'surface', pitchRise: 9 },
        ],
      }),
      0,
    );
    expect(roof.surfaceAreaSqFt).toBeCloseTo(1000 * Math.sqrt(1.25) + 500 + 300, 9);
    expect(roof.squares).toBeCloseTo(roof.surfaceAreaSqFt / 100, 12);
  });

  it('aplica el desperdicio a los squares', () => {
    const roof = summarizeRoof(
      measure({ sections: [{ areaSqFt: 2000, areaKind: 'surface', pitchRise: 4 }] }),
      1500,
    );
    expect(roof.squares).toBe(20);
    expect(roof.squaresWithWaste).toBeCloseTo(23, 12);
  });
});
