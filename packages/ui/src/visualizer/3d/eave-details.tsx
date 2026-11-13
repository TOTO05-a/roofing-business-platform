import type { Material } from 'three';
import { HOUSE, ROOF_PARAMS, roofDerived } from './roof-geometry';

const { halfLength: L, halfWidth: w, eaveY: yE, slope } = ROOF_PARAMS;
const yR = roofDerived({ ...ROOF_PARAMS, hipInset: 0 }).ridgeY;
const FASCIA_H = 0.2;
const FASCIA_T = 0.03;

function Gutter({
  length,
  position,
  rotationY = 0,
  material,
}: {
  length: number;
  position: [number, number, number];
  rotationY?: number;
  material: Material;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]} material={material} castShadow>
        <cylinderGeometry args={[0.065, 0.065, length, 12, 1, true, Math.PI, Math.PI]} />
      </mesh>
    </group>
  );
}

/** Imposta, soffit, canalones y bajantes. Los de los extremos solo existen con faldones de extremo. */
export function EaveDetails({
  ends,
  trim,
  metal,
}: {
  ends: boolean;
  trim: Material;
  metal: Material;
}) {
  const gutterY = yE - 0.1;
  const drop = Math.atan(slope);
  const rakeLen = Math.hypot(w, yR - yE);
  const spouts: [number, number][] = [
    [L - 0.25, w + 0.07],
    [-L + 0.25, w + 0.07],
    [L - 0.25, -w - 0.07],
    [-L + 0.25, -w - 0.07],
  ];
  return (
    <group>
      {/* Imposta (fascia) de los aleros largos. */}
      {[-1, 1].map((sz) => (
        <mesh
          key={`f${sz}`}
          position={[0, yE - FASCIA_H / 2 + 0.02, sz * (w + FASCIA_T / 2)]}
          material={trim}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[2 * L + 2 * FASCIA_T, FASCIA_H, FASCIA_T]} />
        </mesh>
      ))}
      {/* Soffit bajo los aleros largos. */}
      {[-1, 1].map((sz) => (
        <mesh
          key={`s${sz}`}
          position={[0, yE - 0.012, sz * (HOUSE.depth / 2 + HOUSE.overhang / 2)]}
          material={trim}
          receiveShadow
        >
          <boxGeometry args={[2 * L, 0.02, HOUSE.overhang]} />
        </mesh>
      ))}
      {[-1, 1].map((sz) => (
        <Gutter
          key={`g${sz}`}
          length={2 * L}
          position={[0, gutterY, sz * (w + FASCIA_T + 0.05)]}
          material={metal}
        />
      ))}
      {ends ? (
        <>
          {[-1, 1].map((sx) => (
            <group key={`e${sx}`}>
              <mesh
                position={[sx * (L + FASCIA_T / 2), yE - FASCIA_H / 2 + 0.02, 0]}
                material={trim}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[FASCIA_T, FASCIA_H, 2 * w + 2 * FASCIA_T]} />
              </mesh>
              <mesh
                position={[sx * (HOUSE.length / 2 + HOUSE.overhang / 2), yE - 0.012, 0]}
                material={trim}
                receiveShadow
              >
                <boxGeometry args={[HOUSE.overhang, 0.02, HOUSE.depth]} />
              </mesh>
              <Gutter
                length={2 * w}
                position={[sx * (L + FASCIA_T + 0.05), gutterY, 0]}
                rotationY={Math.PI / 2}
                material={metal}
              />
            </group>
          ))}
        </>
      ) : (
        /* Dos aguas: tabla de borde (rake) siguiendo el faldón en cada hastial. */
        [-1, 1].flatMap((sx) =>
          [-1, 1].flatMap((sz) => [
            <mesh
              key={`u${sx}${sz}`}
              position={[
                sx * (HOUSE.length / 2 + HOUSE.overhang / 2),
                (yE + yR) / 2 - 0.045,
                (sz * w) / 2 - sz * 0.02,
              ]}
              rotation={[sz * drop, 0, 0]}
              material={trim}
              receiveShadow
            >
              <boxGeometry args={[HOUSE.overhang, 0.02, rakeLen]} />
            </mesh>,
            <mesh
              key={`r${sx}${sz}`}
              position={[sx * (L + FASCIA_T / 2), (yE + yR) / 2 - 0.11, (sz * w) / 2]}
              rotation={[sz * drop, 0, 0]}
              material={trim}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[FASCIA_T, FASCIA_H, rakeLen]} />
            </mesh>,
          ]),
        )
      )}
      {/* Bajantes en las cuatro esquinas. */}
      {spouts.map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, (gutterY - 0.05) / 2, z]} material={metal} castShadow>
          <cylinderGeometry args={[0.04, 0.04, gutterY - 0.05, 10]} />
        </mesh>
      ))}
    </group>
  );
}
