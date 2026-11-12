import { describe, expect, it } from 'vitest';
import {
  applyWaste,
  ceilSnapped,
  divRoundHalfUp,
  percentOfCents,
  scaledQuantityTimesCents,
  snap,
  toScaledQuantity,
} from './money.js';

describe('snap / ceilSnapped', () => {
  it('elimina ruido de coma flotante', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(snap(0.1 + 0.2)).toBe(0.3);
    expect(ceilSnapped(0.1 * 3 * 10)).toBe(3);
  });

  it('redondea hacia arriba lo que realmente es fracción', () => {
    expect(ceilSnapped(3.3)).toBe(4);
    expect(ceilSnapped(0.000001)).toBe(1);
    expect(ceilSnapped(0)).toBe(0);
  });
});

describe('divRoundHalfUp', () => {
  it('sube la mitad exacta', () => {
    expect(divRoundHalfUp(5, 10)).toBe(1);
    expect(divRoundHalfUp(15, 10)).toBe(2);
  });

  it('baja por debajo de la mitad y respeta divisiones exactas', () => {
    expect(divRoundHalfUp(4, 10)).toBe(0);
    expect(divRoundHalfUp(14, 10)).toBe(1);
    expect(divRoundHalfUp(20, 10)).toBe(2);
    expect(divRoundHalfUp(0, 10)).toBe(0);
  });
});

describe('percentOfCents', () => {
  it('aplica puntos base con half-up', () => {
    expect(percentOfCents(10_000, 825)).toBe(825);
    expect(percentOfCents(1, 5000)).toBe(1);
    expect(percentOfCents(1, 4999)).toBe(0);
    expect(percentOfCents(418_560, 825)).toBe(34_531);
  });

  it('con 0 bps devuelve 0 y con 10 000 bps el mismo monto', () => {
    expect(percentOfCents(12_345, 0)).toBe(0);
    expect(percentOfCents(12_345, 10_000)).toBe(12_345);
  });
});

describe('applyWaste', () => {
  it('aplica el desperdicio en puntos base', () => {
    expect(applyWaste(30, 1000)).toBeCloseTo(33, 9);
    expect(applyWaste(30, 0)).toBe(30);
    expect(applyWaste(10, 10_000)).toBe(20);
  });
});

describe('cantidades escaladas', () => {
  it('convierte a milésimas con half-up', () => {
    expect(toScaledQuantity(22.360679775)).toBe(22_361);
    expect(toScaledQuantity(0.0005)).toBe(1);
    expect(toScaledQuantity(0.0004)).toBe(0);
    expect(toScaledQuantity(30)).toBe(30_000);
  });

  it('multiplica por el precio y redondea una sola vez', () => {
    expect(scaledQuantityTimesCents(30_000, 10_000)).toBe(300_000);
    expect(scaledQuantityTimesCents(500, 1)).toBe(1);
    expect(scaledQuantityTimesCents(499, 1)).toBe(0);
    expect(scaledQuantityTimesCents(0, 12_345)).toBe(0);
  });
});
