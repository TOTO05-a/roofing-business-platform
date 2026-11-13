import type { RoofMaterialId, RoofShape } from '@roofing/shared/visualizer';
import type { CSSProperties } from 'react';
import { HOUSE, pathOf, project, roofGeometry } from './geometry';
import { RoofPaint } from './roof-paint';

export interface RoofSpec {
  shape: RoofShape;
  material: RoofMaterialId;
  hex: string;
  textureUrl?: string | undefined;
}

const dark = (pct: number) => `color-mix(in srgb, var(--roof) ${100 - pct}%, black)`;
const light = (pct: number) => `color-mix(in srgb, var(--roof) ${100 - pct}%, white)`;

const { w, h, overhang: o, rise } = HOUSE;
const slope = rise / (HOUSE.d / 2);
const yEave = h - slope * o;

/** Alero: fascia y canaleta (se anima junto con el techo). */
function Eave({ shape }: { shape: RoofShape }) {
  const x0 = shape === 'gable' ? -HOUSE.rake : -o;
  const x1 = shape === 'gable' ? w + HOUSE.rake : w + o;
  const [fl, fy] = project(x0, yEave, -o);
  const [fr] = project(x1, yEave, -o);
  const gutterY = fy + 5;
  return (
    <g>
      <rect x={fl} y={fy} width={fr - fl} height="5.5" style={{ fill: 'var(--trim)' }} />
      <rect x={fl} y={fy + 4.5} width={fr - fl} height="1.6" style={{ fill: 'color-mix(in srgb, var(--brand-slate) 28%, transparent)' }} />
      <rect
        x={fl - 1.5}
        y={gutterY}
        width={fr - fl + 3}
        height="6.5"
        rx="3"
        style={{ fill: 'color-mix(in srgb, var(--trim) 82%, var(--brand-slate))' }}
      />
      <rect x={fl} y={gutterY + 1} width={fr - fl} height="1.4" style={{ fill: 'color-mix(in srgb, white 55%, transparent)' }} />
    </g>
  );
}


const SPOUT_STROKE = 'color-mix(in srgb, var(--trim) 82%, var(--brand-slate))';

/** Bajantes: son fijas, quedan bajo los aleros de ambas formas de techo. */
export function Downspouts() {
  const gutterBottom = project(0, yEave, -o)[1] + 11;
  return (
    <g>
      {[14, w - 14].map((sx) => {
        const top = project(sx, yEave, -o);
        const wall = project(sx, h - 26, -3);
        const foot = project(sx, 9, -3);
        const kick = project(sx + 12, 3, -3);
        return (
          <g key={sx} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={pathOf([top[0], gutterBottom], wall, foot, kick)} strokeWidth="6" style={{ stroke: SPOUT_STROKE }} />
            <path
              d={pathOf([wall[0] - 1.6, wall[1]], [foot[0] - 1.6, foot[1]])}
              strokeWidth="1.4"
              style={{ stroke: 'color-mix(in srgb, white 50%, transparent)' }}
            />
          </g>
        );
      })}
    </g>
  );
}

/**
 * Una capa de techo completa (planos, remates, alero) para una combinación forma + material + color.
 * `uid` hace únicos los ids de patrón y degradado entre capas superpuestas.
 */
export function RoofLayer({ spec, uid }: { spec: RoofSpec; uid: string }) {
  const g = roofGeometry(spec.shape);
  const pat = `${uid}-pat`;
  const lit = `${uid}-lit`;
  const style = { ['--roof' as string]: spec.hex } as CSSProperties;
  return (
    <g style={style} data-roof-shape={spec.shape}>
      <defs>
        <RoofPaint id={pat} material={spec.material} textureUrl={spec.textureUrl} />
        <linearGradient id={lit} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0.16" />
          <stop offset="0.55" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="black" stopOpacity="0.16" />
        </linearGradient>
      </defs>

      {g.gableEnd && (
        <polygon
          points={g.gableEnd}
          strokeWidth="3"
          strokeLinejoin="round"
          style={{ fill: 'color-mix(in srgb, var(--wall-side) 88%, var(--brand-slate))', stroke: 'var(--trim)' }}
        />
      )}
      {g.side && (
        <>
          <polygon points={g.side} fill={`url(#${pat})`} />
          <polygon points={g.side} style={{ fill: 'color-mix(in srgb, var(--brand-slate) 34%, transparent)' }} />
        </>
      )}
      <polygon points={g.front} fill={`url(#${pat})`} />
      <polygon points={g.front} fill={`url(#${lit})`} />

      {g.rakeEdges.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ stroke: 'var(--trim)' }}
        />
      ))}
      {g.ridgeLines.map((d, i) => (
        <g key={d} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={d} strokeWidth={i === 0 ? 5 : 3.6} style={{ stroke: dark(28) }} />
          <path d={d} strokeWidth={i === 0 ? 1.6 : 1.2} style={{ stroke: light(30) }} transform="translate(0 -1.4)" />
        </g>
      ))}
      <Eave shape={spec.shape} />
    </g>
  );
}
