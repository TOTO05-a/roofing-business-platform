import type { BufferAttribute } from 'three';
import { describe, expect, it } from 'vitest';
import { buildRoofData, ROOF_PARAMS } from './roof-geometry';
import { toGeometry, updateGeometry } from './roof-buffers';

describe('updateGeometry', () => {
  it('reutiliza la geometría si el número de vértices no cambia', () => {
    const g = toGeometry(buildRoofData({ ...ROOF_PARAMS, hipInset: 0.3 }));
    const position = g.getAttribute('position');
    const next = updateGeometry(g, buildRoofData({ ...ROOF_PARAMS, hipInset: 0.6 }));
    expect(next).toBe(g);
    expect(g.getAttribute('position')).toBe(position);
    expect((position as BufferAttribute).version).toBeGreaterThan(0);
  });

  it('regenera si cambia el número de vértices (dos aguas y con faldones)', () => {
    const g = toGeometry(buildRoofData({ ...ROOF_PARAMS, hipInset: 0 }));
    const next = updateGeometry(g, buildRoofData({ ...ROOF_PARAMS, hipInset: 0.5 }));
    expect(next).not.toBe(g);
  });
});
