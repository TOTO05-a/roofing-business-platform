import type { RoofMaterialId } from '@roofing/shared/visualizer';
import { useState } from 'react';
import { dark, light } from './tones';

/** Tamaño (en unidades del SVG) del mosaico de cada material. */
export const TILE: Record<RoofMaterialId, { w: number; h: number }> = {
  'architectural-shingle': { w: 64, h: 36 },
  'three-tab-shingle': { w: 54, h: 20 },
  'standing-seam-metal': { w: 36, h: 24 },
  'clay-tile': { w: 34, h: 26 },
  slate: { w: 64, h: 36 },
  'cedar-shake': { w: 72, h: 39 },
};

const ROOF = 'var(--roof)';
/** Escala del mosaico sobre la casa (más chico = hiladas más finas). */
const SCALE = 'scale(0.62)';

const shadowStyle = { fill: 'color-mix(in srgb, black 30%, transparent)' };

interface Props {
  /** Identificador único del `<pattern>` (se referencia con `url(#id)`). */
  id: string;
  material: RoofMaterialId;
  /** Foto opcional; si falta se usa el patrón procedural. */
  textureUrl?: string | undefined;
}

/** Lado (unidades del SVG) de la celda cuadrada de una textura fotográfica repetible. */
export const TEXTURE_CELL = 96;

/** Texturas cuya imagen no cargó: se evita reintentarlas y se usa el patrón procedural. */
const failedTextures = new Set<string>();

/** Definiciones SVG (patrón) de un material. Debe renderizarse dentro de un elemento con `--roof`. */
export function RoofPaint({ id, material, textureUrl }: Props) {
  const [, setFailures] = useState(0);
  const { w, h } = TILE[material];
  if (textureUrl && !failedTextures.has(textureUrl)) {
    return (
      <pattern
        id={id}
        patternUnits="userSpaceOnUse"
        width={TEXTURE_CELL}
        height={TEXTURE_CELL}
        patternTransform={SCALE}
        data-texture={material}
      >
        <image
          href={textureUrl}
          width={TEXTURE_CELL}
          height={TEXTURE_CELL}
          preserveAspectRatio="xMidYMid slice"
          style={{ filter: 'grayscale(1) brightness(1.35) contrast(1.05)' }}
          onError={() => {
            failedTextures.add(textureUrl);
            setFailures((n) => n + 1);
          }}
        />
        <rect
          width={TEXTURE_CELL}
          height={TEXTURE_CELL}
          style={{ fill: ROOF, mixBlendMode: 'multiply' }}
          data-testid="texture-tint"
        />
      </pattern>
    );
  }
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={w}
      height={h}
      patternTransform={SCALE}
      data-procedural={material}
    >
      <rect width={w} height={h} style={{ fill: ROOF }} />
      {material === 'architectural-shingle' && <Architectural />}
      {material === 'three-tab-shingle' && <ThreeTab />}
      {material === 'standing-seam-metal' && <StandingSeam id={id} />}
      {material === 'clay-tile' && <ClayTile id={id} />}
      {material === 'slate' && <SlateSlabs />}
      {material === 'cedar-shake' && <CedarShake />}
    </pattern>
  );
}

/** Teja laminada: pestañas de ancho irregular, dos hiladas escalonadas y sombra bajo cada una. */
function Architectural() {
  return (
    <>
      <rect y="0" width="64" height="18" style={{ fill: dark(4) }} />
      <rect y="18" width="64" height="18" style={{ fill: light(5) }} />
      <rect x="21.2" y="0" width="14" height="14" style={{ fill: dark(9) }} />
      <rect x="8.2" y="18" width="18" height="14" style={{ fill: light(8) }} />
      <rect x="54.2" y="18" width="9.8" height="14" style={{ fill: dark(8) }} />
      <rect y="14" width="64" height="4" style={shadowStyle} />
      <rect y="32" width="64" height="4" style={shadowStyle} />
      {[19, 47].map((x) => (
        <rect key={`a${x}`} x={x} y="0" width="2.2" height="16" style={shadowStyle} />
      ))}
      {[6, 34, 52].map((x) => (
        <rect key={`b${x}`} x={x} y="18" width="2.2" height="16" style={shadowStyle} />
      ))}
      <rect y="0" width="64" height="1.2" style={{ fill: light(22) }} opacity="0.5" />
      <rect y="18" width="64" height="1.2" style={{ fill: light(22) }} opacity="0.5" />
    </>
  );
}

/** Teja de tres lengüetas: hiladas rectas con ranuras alineadas y escalonadas. */
function ThreeTab() {
  return (
    <>
      <rect y="8" width="54" height="2.5" style={shadowStyle} />
      <rect y="18" width="54" height="2" style={shadowStyle} />
      {[0, 18, 36].map((x) => (
        <rect key={`s${x}`} x={x} y="0" width="1.6" height="8" style={shadowStyle} />
      ))}
      {[9, 27, 45].map((x) => (
        <rect key={`t${x}`} x={x} y="10" width="1.6" height="8" style={shadowStyle} />
      ))}
      <rect y="0" width="54" height="1" style={{ fill: light(18) }} opacity="0.45" />
      <rect y="10" width="54" height="1" style={{ fill: light(18) }} opacity="0.45" />
    </>
  );
}

/** Metal de junta alzada: paneles verticales con nervadura y un brillo suave. */
function StandingSeam({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sheen`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="black" stopOpacity="0.1" />
          <stop offset="0.35" stopColor="white" stopOpacity="0.14" />
          <stop offset="0.7" stopColor="black" stopOpacity="0.02" />
          <stop offset="1" stopColor="black" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <rect width="36" height="24" fill={`url(#${id}-sheen)`} />
      <rect x="0" width="3.2" height="24" style={{ fill: light(26) }} />
      <rect x="3.2" width="1.6" height="24" style={shadowStyle} />
      <rect x="34.4" width="1.6" height="24" style={shadowStyle} />
    </>
  );
}

/** Teja de barro: medias cañas con sombra curva al pie de cada hilada. */
function ClayTile({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-barrel`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" style={{ stopColor: dark(28) }} />
          <stop offset="0.3" style={{ stopColor: light(14) }} />
          <stop offset="0.62" style={{ stopColor: ROOF }} />
          <stop offset="1" style={{ stopColor: dark(32) }} />
        </linearGradient>
      </defs>
      <rect width="34" height="26" fill={`url(#${id}-barrel)`} />
      <path d="M0 22.5 Q17 28.5 34 22.5 L34 26 L0 26Z" style={shadowStyle} />
      <path
        d="M0 22.5 Q17 28.5 34 22.5"
        fill="none"
        strokeWidth="1"
        style={{ stroke: light(20) }}
      />
    </>
  );
}

/** Pizarra: lajas rectangulares con tono ligeramente distinto y juntas escalonadas. */
function SlateSlabs() {
  return (
    <>
      <rect x="0" y="0" width="32" height="18" style={{ fill: dark(6) }} />
      <rect x="32" y="0" width="32" height="18" style={{ fill: light(7) }} />
      <rect x="-16" y="18" width="32" height="18" style={{ fill: light(3) }} />
      <rect x="16" y="18" width="32" height="18" style={{ fill: dark(10) }} />
      <rect x="48" y="18" width="32" height="18" style={{ fill: light(5) }} />
      <rect y="15.4" width="64" height="2.6" style={shadowStyle} />
      <rect y="33.4" width="64" height="2.6" style={shadowStyle} />
      {[0, 32].map((x) => (
        <rect key={`a${x}`} x={x} y="0" width="1.4" height="15.4" style={shadowStyle} />
      ))}
      {[16, 48].map((x) => (
        <rect key={`b${x}`} x={x} y="18" width="1.4" height="15.4" style={shadowStyle} />
      ))}
    </>
  );
}

const SHAKE_ROWS: { y: number; cuts: number[]; tones: number[] }[] = [
  { y: 0, cuts: [0, 11, 26, 38, 55, 72], tones: [-8, 6, -3, 9, -6] },
  { y: 13, cuts: [-6, 8, 21, 40, 50, 66, 78], tones: [5, -9, 4, -4, 8, -5] },
  { y: 26, cuts: [0, 15, 29, 44, 58, 72], tones: [-5, 8, -7, 5, -3] },
];

/** Tejuela de cedro: tablillas de ancho irregular con variación de tono y vetas. */
function CedarShake() {
  return (
    <>
      {SHAKE_ROWS.map((row) =>
        row.cuts.slice(0, -1).map((x, i) => {
          const next = row.cuts[i + 1] ?? x + 10;
          const tone = row.tones[i] ?? 0;
          return (
            <g key={`${row.y}-${x}`}>
              <rect
                x={x}
                y={row.y}
                width={next - x - 1}
                height="13"
                style={{ fill: tone >= 0 ? light(tone) : dark(-tone) }}
              />
              <rect
                x={x + (next - x) * 0.45}
                y={row.y}
                width="0.7"
                height="12"
                style={{ fill: 'color-mix(in srgb, black 25%, transparent)' }}
              />
            </g>
          );
        }),
      )}
      {[0, 13, 26].map((y) => (
        <rect key={y} y={y + 10} width="72" height="3" style={shadowStyle} />
      ))}
    </>
  );
}
