import { describe, expect, it } from 'vitest';
import {
  buildRibsData,
  buildRoofData,
  buildRoofFaces,
  gableInfillPolygon,
  polygonSpanAtU,
  roofDerived,
  ROOF_PARAMS,
  type RoofData,
} from './roof-geometry';

const gable = { ...ROOF_PARAMS, hipInset: 0 };
const hip = { ...ROOF_PARAMS, hipInset: 1 };

/** Vértices únicos de la geometría. */
function maxX(d: RoofData) {
  let m = -Infinity;
  for (let i = 0; i < d.positions.length; i += 3) m = Math.max(m, d.positions[i]!);
  return m;
}

describe('techo paramétrico', () => {
  it('dos aguas: dos faldones; cuatro aguas: cuatro', () => {
    expect(buildRoofFaces(gable)).toHaveLength(2);
    expect(buildRoofFaces(hip)).toHaveLength(4);
  });

  it('la cumbrera es más corta con cuatro aguas y la altura de la cumbrera no cambia', () => {
    const g = roofDerived(gable);
    const h = roofDerived(hip);
    expect(h.ridgeHalf).toBeLessThan(g.ridgeHalf);
    expect(g.ridgeHalf).toBeCloseTo(ROOF_PARAMS.halfLength);
    expect(h.ridgeHalf).toBeCloseTo(ROOF_PARAMS.halfLength - ROOF_PARAMS.halfWidth);
    expect(h.ridgeY).toBeCloseTo(g.ridgeY);
  });

  it('valores intermedios interpolan la cumbrera', () => {
    const mid = roofDerived({ ...ROOF_PARAMS, hipInset: 0.5 });
    expect(mid.ridgeHalf).toBeGreaterThan(roofDerived(hip).ridgeHalf);
    expect(mid.ridgeHalf).toBeLessThan(roofDerived(gable).ridgeHalf);
  });

  it('los faldones miran hacia fuera y hacia arriba, con normales unitarias', () => {
    for (const params of [gable, hip]) {
      const faces = buildRoofFaces(params);
      for (const f of faces) {
        const c = f.points.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
        const cx = c[0] / f.points.length;
        const cz = c[2] / f.points.length;
        expect(Math.hypot(...f.normal)).toBeCloseTo(1);
        expect(f.normal[1]).toBeGreaterThan(0);
        // La componente horizontal de la normal apunta en el sentido del centro del faldón.
        expect(f.normal[0] * cx + f.normal[2] * cz).toBeGreaterThan(0);
      }
    }
  });

  it('todos los faldones tienen la misma pendiente con cuatro aguas (6/12)', () => {
    for (const f of buildRoofFaces(hip)) {
      const slope = Math.hypot(f.normal[0], f.normal[2]) / f.normal[1];
      expect(slope).toBeCloseTo(ROOF_PARAMS.slope, 5);
    }
  });

  it('las UV están en metros a lo largo de la pendiente (v hacia la cumbrera)', () => {
    const [front] = buildRoofFaces(gable);
    const vs = front!.uv.map((p) => p[1]);
    const us = front!.uv.map((p) => p[0]);
    const slopeLength = Math.hypot(ROOF_PARAMS.halfWidth, roofDerived(gable).rise);
    expect(Math.min(...vs)).toBeCloseTo(0);
    expect(Math.max(...vs)).toBeCloseTo(slopeLength);
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(2 * ROOF_PARAMS.halfLength);
  });

  it('el faldón triangular de extremo también mide en metros y sus hileras siguen su pendiente', () => {
    const faces = buildRoofFaces(hip);
    const end = faces[2]!;
    expect(end.points).toHaveLength(3);
    const us = end.uv.map((p) => p[0]);
    const vs = end.uv.map((p) => p[1]);
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(2 * ROOF_PARAMS.halfWidth);
    expect(Math.max(...vs)).toBeCloseTo(Math.hypot(ROOF_PARAMS.halfWidth, roofDerived(hip).rise));
    // El alero del extremo corre a lo largo de z: la hilera es paralela a él.
    expect(Math.abs(end.eaveDir[2])).toBe(1);
  });

  it('la geometría tiene atributos coherentes', () => {
    for (const params of [gable, hip]) {
      const d = buildRoofData(params);
      const n = d.positions.length / 3;
      expect(d.normals.length).toBe(n * 3);
      expect(d.uvs.length).toBe(n * 2);
      expect(Math.max(...d.indices)).toBeLessThan(n);
      for (let i = 0; i < d.normals.length; i += 3) {
        expect(Math.hypot(d.normals[i]!, d.normals[i + 1]!, d.normals[i + 2]!)).toBeCloseTo(1, 4);
        expect(d.normals[i + 1]!).toBeGreaterThan(0);
      }
    }
  });

  it('con cuatro aguas hay más caballete (limatesas) que con dos', () => {
    // Los vértices de caballete se añaden tras los de los faldones.
    expect(buildRoofData(hip).indices.length).toBeGreaterThan(buildRoofData(gable).indices.length);
    expect(maxX(buildRoofData(gable))).toBeCloseTo(ROOF_PARAMS.halfLength, 1);
  });
});

describe('nervios de la junta alzada', () => {
  it('hay ≈ 1 nervio cada 41 cm y menos con cuatro aguas (recortados)', () => {
    const g = buildRibsData(gable);
    const h = buildRibsData(hip);
    expect(g.positions.length).toBeGreaterThan(0);
    // 5 caras por nervio × 4 vértices.
    const ribsG = g.positions.length / 3 / 20;
    expect(ribsG).toBeGreaterThan(60);
    expect(ribsG).toBeLessThan(90);
    expect(h.positions.length).toBeGreaterThan(0);
  });

  it('polygonSpanAtU recorta el trapecio y el triángulo', () => {
    const tri: [number, number][] = [
      [0, 0],
      [4, 0],
      [2, 3],
    ];
    expect(polygonSpanAtU(tri, 2)).toEqual([0, 3]);
    const s = polygonSpanAtU(tri, 1)!;
    expect(s[0]).toBeCloseTo(0);
    expect(s[1]).toBeCloseTo(1.5);
    expect(polygonSpanAtU(tri, 5)).toBeNull();
  });
});

describe('hastial', () => {
  it('con dos aguas es un triángulo y con cuatro aguas desaparece', () => {
    expect(gableInfillPolygon(gable)).toHaveLength(3);
    expect(gableInfillPolygon(hip)).toHaveLength(0);
  });

  it('con valores intermedios es un trapecio más bajo que el triángulo', () => {
    const mid = gableInfillPolygon({ ...ROOF_PARAMS, hipInset: 0.5 });
    expect(mid).toHaveLength(4);
    const apex = gableInfillPolygon(gable)[2]![1];
    expect(mid[2]![1]).toBeLessThan(apex);
  });
});
