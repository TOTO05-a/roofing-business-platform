import { HOUSE, project, points } from './geometry';

const { w, d, h } = HOUSE;
const P = project;

/**
 * Variables de color de la escena. Todo deriva de los tokens de marca (`--brand-*`)
 * y de estado; el único color libre del dibujo es el del material elegido.
 */
export const SCENE_VARS = {
  '--sky-top': 'color-mix(in srgb, var(--info) 22%, var(--brand-sand))',
  '--sky-low': 'color-mix(in srgb, var(--brand-sand) 75%, white)',
  '--wall': 'color-mix(in srgb, var(--brand-sand) 84%, var(--brand-copper))',
  '--wall-side': 'color-mix(in srgb, var(--wall) 82%, var(--brand-slate))',
  '--trim': 'color-mix(in srgb, var(--brand-sand) 55%, white)',
  '--lawn-far': 'color-mix(in srgb, var(--success) 42%, var(--brand-sand))',
  '--lawn-near': 'color-mix(in srgb, var(--success) 62%, var(--brand-sand))',
  '--shrub': 'color-mix(in srgb, var(--success) 70%, var(--brand-slate))',
  '--glass-a': 'color-mix(in srgb, var(--info) 38%, var(--brand-sand))',
  '--glass-b': 'color-mix(in srgb, var(--brand-slate) 62%, var(--info))',
  '--door': 'var(--brand-slate)',
  '--path': 'color-mix(in srgb, var(--brand-sand) 78%, var(--brand-slate))',
} as const;

const slateA = (pct: number) => `color-mix(in srgb, var(--brand-slate) ${pct}%, transparent)`;

/** Ventana de la fachada con marco, postigos, parteluz y reflejo. */
function Window({ x, y = 24, width = 88, height = 52 }: { x: number; y?: number; width?: number; height?: number }) {
  const [x0, yTop] = P(x, y + height, 0);
  const [x1, yBot] = P(x + width, y, 0);
  const pw = x1 - x0;
  const ph = yBot - yTop;
  const shutter = 15;
  const slats = Array.from({ length: 8 }, (_, i) => yTop + 4 + i * ((ph - 4) / 8));
  return (
    <g>
      {/* Postigos */}
      {[x0 - shutter - 3, x1 + 3].map((sx) => (
        <g key={sx}>
          <rect x={sx} y={yTop - 1} width={shutter} height={ph + 2} rx="1.5" style={{ fill: 'var(--door)' }} />
          {slats.map((sy) => (
            <rect
              key={`l${sy}`}
              x={sx + 2}
              y={sy}
              width={shutter - 4}
              height="1.4"
              style={{ fill: 'color-mix(in srgb, white 16%, transparent)' }}
            />
          ))}
        </g>
      ))}
      {/* Marco y vidrio */}
      <rect x={x0 - 3} y={yTop - 3} width={pw + 6} height={ph + 6} rx="2" style={{ fill: 'var(--trim)' }} />
      <rect x={x0} y={yTop} width={pw} height={ph} style={{ fill: 'url(#scene-glass)' }} />
      <path
        d={`M${x0 + 8} ${yBot} L${x0 + pw * 0.42} ${yTop} L${x0 + pw * 0.58} ${yTop} L${x0 + 8 + pw * 0.16} ${yBot}Z`}
        style={{ fill: 'color-mix(in srgb, white 16%, transparent)' }}
      />
      <rect x={x0 + pw / 2 - 1.4} y={yTop} width="2.8" height={ph} style={{ fill: 'var(--trim)' }} />
      <rect x={x0} y={yTop + ph / 2 - 1.4} width={pw} height="2.8" style={{ fill: 'var(--trim)' }} />
      {/* Antepecho */}
      <rect x={x0 - 6} y={yBot + 2} width={pw + 12} height="5" rx="1.5" style={{ fill: 'var(--trim)' }} />
      <rect x={x0 - 6} y={yBot + 6} width={pw + 12} height="2" style={{ fill: slateA(28) }} />
    </g>
  );
}

function Shrub({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <ellipse cx={x + r * 0.15} cy={y + r * 0.78} rx={r * 1.05} ry={r * 0.22} style={{ fill: slateA(24) }} />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.82} style={{ fill: 'var(--shrub)' }} />
      <ellipse cx={x - r * 0.28} cy={y - r * 0.22} rx={r * 0.55} ry={r * 0.4} style={{ fill: 'color-mix(in srgb, var(--shrub) 76%, white)' }} opacity="0.7" />
      <ellipse cx={x + r * 0.42} cy={y + r * 0.2} rx={r * 0.5} ry={r * 0.4} style={{ fill: 'color-mix(in srgb, var(--shrub) 82%, black)' }} opacity="0.55" />
    </g>
  );
}

function Tree({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse cx={x + 14} cy={y + 4} rx="52" ry="9" style={{ fill: slateA(20) }} />
      <rect x={x - 4} y={y - 50} width="9" height="54" rx="3" style={{ fill: 'color-mix(in srgb, var(--brand-copper) 38%, var(--brand-slate))' }} />
      <circle cx={x - 22} cy={y - 74} r="28" style={{ fill: 'color-mix(in srgb, var(--shrub) 85%, black)' }} />
      <circle cx={x + 24} cy={y - 76} r="30" style={{ fill: 'color-mix(in srgb, var(--shrub) 92%, black)' }} />
      <circle cx={x} cy={y - 96} r="34" style={{ fill: 'var(--shrub)' }} />
      <circle cx={x - 10} cy={y - 104} r="20" style={{ fill: 'color-mix(in srgb, var(--shrub) 74%, white)' }} opacity="0.55" />
    </g>
  );
}

/** Fondo y casa sin techo (cielo, césped, paredes, puerta, ventanas, arbustos). */
export function HouseBackdrop() {
  const wallFront = points(P(0, 0, 0), P(w, 0, 0), P(w, h, 0), P(0, h, 0));
  const wallSide = points(P(w, 0, 0), P(w, 0, d), P(w, h, d), P(w, h, 0));
  const foundation = points(P(0, 0, 0), P(w, 0, 0), P(w, 11, 0), P(0, 11, 0));
  const foundationSide = points(P(w, 0, 0), P(w, 0, d), P(w, 11, d), P(w, 11, 0));
  const shadowGround = points(P(w, 0, 0), P(w + 70, 0, 14), P(w + 78, 0, d + 40), P(w, 0, d));
  const [doorX0, doorTop] = P(207, 78, 0);
  const [doorX1, doorBottom] = P(263, 0, 0);
  const dw = doorX1 - doorX0;
  const dh = doorBottom - doorTop;
  const [stepX0, stepY] = P(193, 7, 0);
  const [stepX1] = P(277, 0, 0);

  return (
    <g>
      <defs>
        <linearGradient id="scene-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--sky-top)' }} />
          <stop offset="1" style={{ stopColor: 'var(--sky-low)' }} />
        </linearGradient>
        <radialGradient id="scene-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="white" stopOpacity="0.85" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="scene-lawn" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--lawn-far)' }} />
          <stop offset="1" style={{ stopColor: 'var(--lawn-near)' }} />
        </linearGradient>
        <linearGradient id="scene-glass" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--glass-a)' }} />
          <stop offset="1" style={{ stopColor: 'var(--glass-b)' }} />
        </linearGradient>
        <linearGradient id="scene-eave-shadow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--brand-slate)' }} stopOpacity="0.42" />
          <stop offset="1" style={{ stopColor: 'var(--brand-slate)' }} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="scene-wall-light" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="white" stopOpacity="0.14" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <pattern id="scene-siding" patternUnits="userSpaceOnUse" width="10" height="11">
          <rect y="9.2" width="10" height="1.8" style={{ fill: slateA(9) }} />
          <rect y="8.6" width="10" height="0.7" style={{ fill: 'color-mix(in srgb, white 30%, transparent)' }} />
        </pattern>
        <filter id="scene-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* Cielo, sol y nubes */}
      <rect x="0" y="0" width="800" height="430" fill="url(#scene-sky)" />
      <circle cx="640" cy="150" r="150" fill="url(#scene-sun)" />
      <g style={{ fill: 'var(--trim)' }} opacity="0.75">
        <ellipse cx="150" cy="160" rx="58" ry="12" />
        <ellipse cx="190" cy="152" rx="38" ry="12" />
        <ellipse cx="500" cy="138" rx="46" ry="9" />
        <ellipse cx="530" cy="132" rx="28" ry="9" />
      </g>

      {/* Césped */}
      <rect x="0" y="300" width="800" height="130" fill="url(#scene-lawn)" />
      <path d="M0 304 Q200 292 400 302 T800 298 L800 310 L0 312Z" style={{ fill: 'var(--lawn-far)' }} opacity="0.6" />
      <Tree x={690} y={330} />
      <Tree x={78} y={324} />

      {/* Camino a la puerta */}
      <polygon
        points={points(P(214, 0, 0), P(256, 0, 0), [P(256, 0, 0)[0] + 44, 430], [P(214, 0, 0)[0] - 44, 430])}
        style={{ fill: 'var(--path)' }}
      />
      {/* Sombra del edificio en el suelo */}
      <polygon points={shadowGround} style={{ fill: slateA(34) }} filter="url(#scene-blur)" />
      <polygon points={points(P(-6, 0, -8), P(w + 6, 0, -8), P(w, 0, 0), P(0, 0, 0))} style={{ fill: slateA(22) }} />

      {/* Costado derecho */}
      <polygon points={wallSide} style={{ fill: 'var(--wall-side)' }} />
      <polygon points={wallSide} fill="url(#scene-siding)" />
      <polygon points={foundationSide} style={{ fill: slateA(30) }} />
      <polygon
        points={points(P(w, 50, 70), P(w, 50, 130), P(w, 92, 130), P(w, 92, 70))}
        style={{ fill: 'var(--trim)' }}
      />
      <polygon
        points={points(P(w, 53, 73), P(w, 53, 127), P(w, 89, 127), P(w, 89, 73))}
        fill="url(#scene-glass)"
      />

      {/* Fachada */}
      <polygon points={wallFront} style={{ fill: 'var(--wall)' }} />
      <polygon points={wallFront} fill="url(#scene-siding)" />
      <polygon points={wallFront} fill="url(#scene-wall-light)" />
      <polygon points={foundation} style={{ fill: 'color-mix(in srgb, var(--wall) 65%, var(--brand-slate))' }} />
      <rect x={P(0, h - 22, 0)[0]} y={P(0, h, 0)[1]} width={P(w, 0, 0)[0] - P(0, 0, 0)[0]} height="24" fill="url(#scene-eave-shadow)" />

      <Window x={40} />
      <Window x={330} />

      {/* Puerta principal */}
      <rect x={doorX0 - 5} y={doorTop - 5} width={dw + 10} height={dh + 5} rx="2" style={{ fill: 'var(--trim)' }} />
      <rect x={doorX0} y={doorTop} width={dw} height={dh} style={{ fill: 'var(--door)' }} />
      <rect x={doorX0 + 7} y={doorTop + 8} width={dw - 14} height={dh * 0.34} rx="1.5" style={{ fill: 'color-mix(in srgb, white 9%, transparent)' }} />
      <rect x={doorX0 + 7} y={doorTop + 14 + dh * 0.34} width={dw - 14} height={dh * 0.4} rx="1.5" style={{ fill: 'color-mix(in srgb, white 7%, transparent)' }} />
      <circle cx={doorX1 - 9} cy={doorTop + dh * 0.55} r="2.6" style={{ fill: 'var(--brand-copper)' }} />
      <rect x={stepX0} y={stepY} width={stepX1 - stepX0} height="9" rx="1.5" style={{ fill: 'var(--trim)' }} />
      <rect x={stepX0} y={stepY + 7} width={stepX1 - stepX0} height="3" style={{ fill: slateA(25) }} />

      {/* Arbustos */}
      <Shrub x={P(8, 0, 0)[0]} y={P(0, 17, 0)[1]} r={26} />
      <Shrub x={P(88, 0, 0)[0]} y={P(0, 12, 0)[1]} r={19} />
      <Shrub x={P(w - 30, 0, 0)[0]} y={P(0, 16, 0)[1]} r={24} />
      <Shrub x={P(w - 96, 0, 0)[0]} y={P(0, 11, 0)[1]} r={17} />
    </g>
  );
}
