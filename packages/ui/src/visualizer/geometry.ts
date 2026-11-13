import type { RoofShape } from '@roofing/shared/visualizer';

/**
 * Geometría de la casa (una planta, estilo ranch) en proyección oblicua:
 * x = ancho de la fachada, y = altura, z = profundidad (hacia el fondo, a la derecha).
 * Se ve la fachada, el costado derecho y el techo desde arriba.
 */
export const VIEWBOX = '40 112 720 318';

const X0 = 112;
const Y0 = 372;
const KX = 0.36;
const KY = 0.2;

/** Medidas de la casa. */
export const HOUSE = {
  w: 470,
  d: 200,
  h: 108,
  /** Alero (voladizo) en todo el perímetro. */
  overhang: 20,
  /** Voladizo lateral en el techo a dos aguas. */
  rake: 8,
  /** Altura del cumbrero sobre el muro. */
  rise: 46,
} as const;

export type Point = readonly [number, number];

/** Proyecta un punto 3D a coordenadas del SVG. */
export function project(x: number, y: number, z: number): Point {
  return [round(X0 + x + z * KX), round(Y0 - y - z * KY)];
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function points(...pts: Point[]): string {
  return pts.map(([x, y]) => `${x},${y}`).join(' ');
}

export function pathOf(...pts: Point[]): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
}

const { w, d, h, overhang: o, rake, rise } = HOUSE;
const slope = rise / (d / 2);
/** Altura del borde del alero y del cumbrero. */
const yEave = h - slope * o;
const yRidge = h + rise;
const zMid = d / 2;
const halfSpan = d / 2 + o;

export interface RoofGeometry {
  /** Plano frontal (el que mira al frente). */
  front: string;
  /** Plano lateral derecho (solo en cuatro aguas). */
  side: string | null;
  /** Hastial (muro triangular del extremo, solo en dos aguas). */
  gableEnd: string | null;
  /** Líneas de cumbrera y limatesas (se dibujan como remate). */
  ridgeLines: string[];
  /** Borde del alero frontal (fascia), de punta a punta. */
  fascia: string;
  /** Contorno de los bordes inclinados de la cubierta (a dos aguas). */
  rakeEdges: string[];
}

export function roofGeometry(shape: RoofShape): RoofGeometry {
  const fasciaLine = pathOf(project(-o, yEave, -o), project(w + o, yEave, -o));
  if (shape === 'gable') {
    const x0 = -rake;
    const x1 = w + rake;
    const eaveFL = project(x0, yEave, -o);
    const eaveFR = project(x1, yEave, -o);
    const ridgeR = project(x1, yRidge, zMid);
    const ridgeL = project(x0, yRidge, zMid);
    const eaveBR = project(x1, yEave, d + o);
    return {
      front: points(eaveFL, eaveFR, ridgeR, ridgeL),
      side: null,
      gableEnd: points(eaveFR, ridgeR, eaveBR),
      ridgeLines: [pathOf(ridgeL, ridgeR)],
      fascia: pathOf(eaveFL, eaveFR),
      rakeEdges: [pathOf(eaveFR, ridgeR, eaveBR)],
    };
  }
  const rx1 = -o + halfSpan;
  const rx2 = w + o - halfSpan;
  const eaveFL = project(-o, yEave, -o);
  const eaveFR = project(w + o, yEave, -o);
  const eaveBR = project(w + o, yEave, d + o);
  const ridgeL = project(rx1, yRidge, zMid);
  const ridgeR = project(rx2, yRidge, zMid);
  return {
    front: points(eaveFL, eaveFR, ridgeR, ridgeL),
    side: points(eaveFR, ridgeR, eaveBR),
    gableEnd: null,
    ridgeLines: [pathOf(ridgeL, ridgeR), pathOf(eaveFR, ridgeR), pathOf(eaveFL, ridgeL)],
    fascia: fasciaLine,
    rakeEdges: [],
  };
}

/** Caja envolvente aproximada del techo, útil para pruebas. */
export const ROOF_TOP = project(0, yRidge, zMid)[1];
export const WALL_TOP = project(0, h, 0)[1];
export const GROUND_FRONT = Y0;
