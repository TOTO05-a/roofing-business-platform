/**
 * Geometría paramétrica del techo (T11, T21). Funciones puras, sin Three.js ni WebGL.
 *
 * Una sola función (`buildRoofFaces` / `buildRoofData`) genera el techo a partir de `hipInset`:
 * 0 = dos aguas, 1 = cuatro aguas con faldones a la misma pendiente. Todo en metros.
 *
 * Ejes: x = largo de la casa (cumbrera), y = altura, z = fondo (fachada principal en +z).
 * Las UV están en metros: u a lo largo del alero, v a lo largo de la pendiente hacia la cumbrera.
 */

export type Vec3 = readonly [number, number, number];

export interface RoofParams {
  /** 0 = dos aguas, 1 = cuatro aguas. */
  hipInset: number;
  /** Semilargo del techo en el alero (incluye el volado). */
  halfLength: number;
  /** Semiancho del techo en el alero (incluye el volado). */
  halfWidth: number;
  /** Pendiente (altura/horizontal); 6/12 = 0,5. */
  slope: number;
  /** Altura del borde exterior del alero. */
  eaveY: number;
}

/** Medidas de la casa ranch de ejemplo (metros). */
export const HOUSE = {
  length: 15,
  depth: 9,
  wallHeight: 2.7,
  overhang: 0.45,
  slope: 0.5,
} as const;

export const ROOF_PARAMS: Omit<RoofParams, 'hipInset'> = {
  halfLength: HOUSE.length / 2 + HOUSE.overhang,
  halfWidth: HOUSE.depth / 2 + HOUSE.overhang,
  slope: HOUSE.slope,
  // El techo queda `ROOF_LIFT` por encima del muro en la línea de apoyo (evita el parpadeo por
  // superficies coincidentes); el borde del alero queda más bajo.
  eaveY: HOUSE.wallHeight - HOUSE.overhang * HOUSE.slope + 0.03,
};

/** Por debajo de este valor se considera dos aguas (sin faldones de extremo). */
export const GABLE_EPSILON = 0.02;
export const RIB_SPACING = 0.41;

export interface RoofFace {
  /** Vértices (polígono convexo) en 3D. */
  points: Vec3[];
  /** Normal unitaria hacia fuera (siempre con y > 0). */
  normal: Vec3;
  /** Dirección horizontal del alero (u). */
  eaveDir: Vec3;
  /** Dirección unitaria de la pendiente hacia la cumbrera (v). */
  slopeDir: Vec3;
  /** Polígono en el espacio UV (metros). */
  uv: [number, number][];
}

export interface RoofData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Valores derivados de los parámetros. */
export function roofDerived(params: RoofParams) {
  const t = params.hipInset < GABLE_EPSILON ? 0 : clamp01(params.hipInset);
  const { halfLength: L, halfWidth: w, slope, eaveY } = params;
  const rise = w * slope;
  return {
    t,
    hasEnds: t > 0,
    /** Semilargo de la cumbrera. */
    ridgeHalf: L - t * w,
    ridgeY: eaveY + rise,
    rise,
  };
}

function makeFace(points: Vec3[], eaveDir: Vec3): RoofFace {
  const [p0, p1, p2] = points as [Vec3, Vec3, Vec3];
  let normal = norm(cross(sub(p1, p0), sub(p2, p0)));
  if (normal[1] < 0) normal = mul(normal, -1);
  let slopeDir = norm(cross(normal, eaveDir));
  if (slopeDir[1] < 0) slopeDir = mul(slopeDir, -1);
  const origin = p0;
  // v = 0 en el alero (el punto más bajo de la cara).
  const vMin = Math.min(...points.map((p) => dot(sub(p, origin), slopeDir)));
  const uv = points.map(
    (p) => [dot(p, eaveDir), dot(sub(p, origin), slopeDir) - vMin] as [number, number],
  );
  return { points, normal, eaveDir, slopeDir, uv };
}

/** Caras de faldón del techo (dos principales y, si no es dos aguas, dos de extremo). */
export function buildRoofFaces(params: RoofParams): RoofFace[] {
  const { halfLength: L, halfWidth: w, eaveY: yE } = params;
  const { hasEnds, ridgeHalf: r, ridgeY: yR } = roofDerived(params);
  const x: Vec3 = [1, 0, 0];
  const z: Vec3 = [0, 0, 1];
  const faces: RoofFace[] = [
    makeFace(
      [
        [-L, yE, w],
        [L, yE, w],
        [r, yR, 0],
        [-r, yR, 0],
      ],
      x,
    ),
    makeFace(
      [
        [L, yE, -w],
        [-L, yE, -w],
        [-r, yR, 0],
        [r, yR, 0],
      ],
      x,
    ),
  ];
  if (hasEnds) {
    faces.push(
      makeFace(
        [
          [L, yE, w],
          [L, yE, -w],
          [r, yR, 0],
        ],
        z,
      ),
      makeFace(
        [
          [-L, yE, -w],
          [-L, yE, w],
          [-r, yR, 0],
        ],
        z,
      ),
    );
  }
  return faces;
}

interface Builder {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

const newBuilder = (): Builder => ({ positions: [], normals: [], uvs: [], indices: [] });

/** Añade un polígono convexo plano; `hint` fija el lado exterior (orientación antihoraria). */
function pushPolygon(
  b: Builder,
  pts: Vec3[],
  uvs: [number, number][],
  hint: Vec3,
  fixedNormal?: Vec3,
) {
  let order = pts.map((_, i) => i);
  const [p0, p1, p2] = pts as [Vec3, Vec3, Vec3];
  let n = norm(cross(sub(p1, p0), sub(p2, p0)));
  if (dot(n, hint) < 0) {
    order = order.reverse();
    n = mul(n, -1);
  }
  if (fixedNormal) n = fixedNormal;
  const base = b.positions.length / 3;
  for (const i of order) {
    const p = pts[i]!;
    const uv = uvs[i]!;
    b.positions.push(p[0], p[1], p[2]);
    b.normals.push(n[0], n[1], n[2]);
    b.uvs.push(uv[0], uv[1]);
  }
  for (let i = 1; i < pts.length - 1; i++) b.indices.push(base, base + i, base + i + 1);
}

function finish(b: Builder): RoofData {
  return {
    positions: new Float32Array(b.positions),
    normals: new Float32Array(b.normals),
    uvs: new Float32Array(b.uvs),
    indices: new Uint32Array(b.indices),
  };
}

const CAP_WIDTH = 0.17;
const CAP_LIFT = 0.07;

/** Caballete (cumbrera y limatesas): una «A» baja que cubre la arista entre dos faldones. */
function pushCap(b: Builder, a: Vec3, c: Vec3, f1: RoofFace, f2: RoofFace) {
  const edge = norm(sub(c, a));
  const nb = norm(add(f1.normal, f2.normal));
  const topA = add(a, mul(nb, CAP_LIFT));
  const topC = add(c, mul(nb, CAP_LIFT));
  for (const [i, f] of [f1, f2].entries()) {
    const centroid = mul(
      f.points.reduce((s, p) => add(s, p), [0, 0, 0] as Vec3),
      1 / f.points.length,
    );
    let d = norm(cross(f.normal, edge));
    if (dot(d, sub(centroid, a)) < 0) d = mul(d, -1);
    const off = add(mul(d, CAP_WIDTH), mul(f.normal, 0.03));
    const sideA = add(a, off);
    const sideC = add(c, off);
    const l = len(sub(c, a));
    const v0 = i * (CAP_WIDTH + 0.05);
    pushPolygon(
      b,
      [topA, topC, sideC, sideA],
      [
        [0, v0],
        [l, v0],
        [l, v0 + CAP_WIDTH],
        [0, v0 + CAP_WIDTH],
      ],
      add(f.normal, nb),
    );
  }
}

/** Geometría del techo: faldones + caballete de cumbrera y limatesas. */
export function buildRoofData(params: RoofParams): RoofData {
  const b = newBuilder();
  const faces = buildRoofFaces(params);
  for (const f of faces) pushPolygon(b, f.points, f.uv, f.normal, f.normal);
  const { halfLength: L, halfWidth: w, eaveY: yE } = params;
  const { ridgeHalf: r, ridgeY: yR, hasEnds } = roofDerived(params);
  const [front, back, endPlus, endMinus] = faces;
  pushCap(b, [-r, yR, 0], [r, yR, 0], front!, back!);
  if (hasEnds) {
    pushCap(b, [L, yE, w], [r, yR, 0], front!, endPlus!);
    pushCap(b, [L, yE, -w], [r, yR, 0], back!, endPlus!);
    pushCap(b, [-L, yE, w], [-r, yR, 0], front!, endMinus!);
    pushCap(b, [-L, yE, -w], [-r, yR, 0], back!, endMinus!);
  }
  return finish(b);
}

/** Intervalo [vmin, vmax] del polígono UV (convexo) en la vertical `u`; `null` si no lo corta. */
export function polygonSpanAtU(poly: [number, number][], u: number): [number, number] | null {
  const vs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [u0, v0] = poly[i]!;
    const [u1, v1] = poly[(i + 1) % poly.length]!;
    if ((u0 <= u && u <= u1) || (u1 <= u && u <= u0)) {
      if (Math.abs(u1 - u0) < 1e-9) vs.push(v0, v1);
      else vs.push(v0 + ((v1 - v0) * (u - u0)) / (u1 - u0));
    }
  }
  if (vs.length === 0) return null;
  return [Math.min(...vs), Math.max(...vs)];
}

const RIB_BASE = 0.0225;
const RIB_TOP = 0.0125;
const RIB_HEIGHT = 0.04;

/**
 * Nervios de la junta alzada (T14): uno cada `RIB_SPACING` siguiendo la pendiente de cada
 * faldón, recortados por las limatesas y los bordes de los faldones triangulares.
 */
export function buildRibsData(params: RoofParams, spacing = RIB_SPACING): RoofData {
  const b = newBuilder();
  for (const f of buildRoofFaces(params)) {
    const us = f.uv.map((p) => p[0]);
    const uMin = Math.min(...us);
    const uMax = Math.max(...us);
    const origin = f.points[0]!;
    const u0 = dot(origin, f.eaveDir);
    const vOrigin = Math.min(...f.points.map((p) => dot(sub(p, origin), f.slopeDir)));
    const at = (u: number, v: number): Vec3 =>
      add(add(origin, mul(f.eaveDir, u - u0)), mul(f.slopeDir, v + vOrigin));
    const first = Math.ceil((uMin + 0.12) / spacing) * spacing;
    for (let u = first; u < uMax - 0.12; u += spacing) {
      const span = polygonSpanAtU(f.uv, u);
      if (!span) continue;
      const v0 = span[0] + 0.02;
      const v1 = span[1] - 0.03;
      if (v1 - v0 < 0.2) continue;
      const lift = f.normal;
      const corner = (side: number, height: number, v: number, half: number): Vec3 =>
        add(at(u + side * half, v), mul(lift, height));
      const bl0 = corner(-1, 0, v0, RIB_BASE);
      const br0 = corner(1, 0, v0, RIB_BASE);
      const tl0 = corner(-1, RIB_HEIGHT, v0, RIB_TOP);
      const tr0 = corner(1, RIB_HEIGHT, v0, RIB_TOP);
      const bl1 = corner(-1, 0, v1, RIB_BASE);
      const br1 = corner(1, 0, v1, RIB_BASE);
      const tl1 = corner(-1, RIB_HEIGHT, v1, RIB_TOP);
      const tr1 = corner(1, RIB_HEIGHT, v1, RIB_TOP);
      const uvOf = (s: number, v: number): [number, number] => [u + s * 0.02, v];
      const quad = (p: [Vec3, Vec3, Vec3, Vec3], uvq: [number, number][], hint: Vec3) =>
        pushPolygon(b, p, uvq, hint);
      const e = f.eaveDir;
      const s = f.slopeDir;
      quad(
        [bl0, bl1, tl1, tl0],
        [uvOf(-1, v0), uvOf(-1, v1), uvOf(-0.5, v1), uvOf(-0.5, v0)],
        add(mul(e, -1), lift),
      );
      quad(
        [br0, br1, tr1, tr0],
        [uvOf(1, v0), uvOf(1, v1), uvOf(0.5, v1), uvOf(0.5, v0)],
        add(e, lift),
      );
      quad(
        [tl0, tl1, tr1, tr0],
        [uvOf(-0.5, v0), uvOf(-0.5, v1), uvOf(0.5, v1), uvOf(0.5, v0)],
        lift,
      );
      quad(
        [bl0, br0, tr0, tl0],
        [uvOf(-1, v0), uvOf(1, v0), uvOf(0.5, v0), uvOf(-0.5, v0)],
        mul(s, -1),
      );
      quad([bl1, br1, tr1, tl1], [uvOf(-1, v1), uvOf(1, v1), uvOf(0.5, v1), uvOf(-0.5, v1)], s);
    }
  }
  return finish(b);
}

/**
 * Hastial de revestimiento bajo el techo: polígono (z, y) en el plano del muro de extremo
 * (`wallHalfLength`). Vacío cuando el faldón de extremo ya lo cubre (cuatro aguas).
 */
export function gableInfillPolygon(
  params: RoofParams,
  wallHalfLength: number = HOUSE.length / 2,
  wallHalfDepth: number = HOUSE.depth / 2,
): [number, number][] {
  const { halfLength: L, halfWidth: w, slope, eaveY: yE } = params;
  const { hasEnds, ridgeHalf: r, ridgeY, rise } = roofDerived(params);
  const y0 = yE + (w - wallHalfDepth) * slope;
  // Altura del faldón de extremo sobre el plano del muro (constante en z).
  const cap = hasEnds ? yE + (rise * (L - wallHalfLength)) / (L - r) : Infinity;
  if (cap <= y0 + 1e-3) return [];
  if (cap >= ridgeY) {
    return [
      [-wallHalfDepth, y0],
      [wallHalfDepth, y0],
      [0, ridgeY],
    ];
  }
  const zc = w - (cap - yE) / slope;
  return [
    [-wallHalfDepth, y0],
    [wallHalfDepth, y0],
    [zc, cap],
    [-zc, cap],
  ];
}

/** Easing suave (entrada y salida) para las transiciones. */
export const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
