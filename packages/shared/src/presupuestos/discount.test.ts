import { describe, expect, it } from 'vitest';
import { applyDiscount } from './discount.js';

describe('applyDiscount', () => {
  it('reparte el descuento de forma proporcional entre material y mano de obra', () => {
    expect(applyDiscount(348_800, 313_200, 1000)).toEqual({
      discountCents: 66_200,
      materialCents: 313_920,
      laborCents: 281_880,
    });
  });

  it('sin descuento devuelve los subtotales intactos', () => {
    expect(applyDiscount(1000, 500, 0)).toEqual({
      discountCents: 0,
      materialCents: 1000,
      laborCents: 500,
    });
  });

  it('con 100 % deja todo en cero', () => {
    expect(applyDiscount(1000, 500, 10_000)).toEqual({
      discountCents: 1500,
      materialCents: 0,
      laborCents: 0,
    });
  });

  it('las dos partes siempre suman el descuento total (half-up)', () => {
    const result = applyDiscount(1, 1, 5000);
    expect(result.discountCents).toBe(1);
    expect(1 - result.materialCents + (1 - result.laborCents)).toBe(1);
  });

  it('con subtotal cero no divide entre cero', () => {
    expect(applyDiscount(0, 0, 5000)).toEqual({
      discountCents: 0,
      materialCents: 0,
      laborCents: 0,
    });
  });

  it('solo mano de obra o solo material', () => {
    expect(applyDiscount(0, 1000, 1000)).toEqual({
      discountCents: 100,
      materialCents: 0,
      laborCents: 900,
    });
    expect(applyDiscount(1000, 0, 1000)).toEqual({
      discountCents: 100,
      materialCents: 900,
      laborCents: 0,
    });
  });
});
