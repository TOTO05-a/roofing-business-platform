import { describe, expect, it } from 'vitest';
import { getRoofMaterial, roofMaterials } from './materials.js';

describe('materiales del visualizador', () => {
  it('tienen ids únicos, textos es/en y colores hex válidos', () => {
    const ids = roofMaterials.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of roofMaterials) {
      expect(m.name.es.trim()).not.toBe('');
      expect(m.name.en.trim()).not.toBe('');
      expect(m.colors.length).toBeGreaterThan(0);
      const colorIds = m.colors.map((col) => col.id);
      expect(new Set(colorIds).size).toBe(colorIds.length);
      for (const col of m.colors) {
        expect(col.hex).toMatch(/^#[0-9a-f]{6}$/);
        expect(col.name.es.trim()).not.toBe('');
        expect(col.name.en.trim()).not.toBe('');
      }
    }
  });

  it('cubre los colores aprobados por material', () => {
    const counts = Object.fromEntries(roofMaterials.map((m) => [m.id, m.colors.length]));
    expect(counts).toEqual({
      'architectural-shingle': 6,
      'three-tab-shingle': 3,
      'standing-seam-metal': 6,
      'clay-tile': 3,
      slate: 3,
      'cedar-shake': 2,
    });
  });

  it('getRoofMaterial devuelve el material o lanza', () => {
    expect(getRoofMaterial('slate').name.es).toBe('Pizarra');
    expect(() => getRoofMaterial('nope' as never)).toThrow();
  });
});
