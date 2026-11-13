import { useThree } from '@react-three/fiber';
import { use, useMemo } from 'react';
import {
  BoxGeometry,
  BufferAttribute,
  CircleGeometry,
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RingGeometry,
  type BufferGeometry,
} from 'three';
import { albedoGain } from './assets';
import { HOUSE } from './roof-geometry';
import { loadSurface } from './textures';

const WALL_TINT = '#ece8df';

export interface HouseMaterials {
  siding: MeshStandardMaterial;
  concrete: MeshStandardMaterial;
  grass: MeshStandardMaterial;
  grassFade: MeshStandardMaterial;
  trim: MeshStandardMaterial;
  aluminum: MeshStandardMaterial;
  glass: MeshPhysicalMaterial;
  door: MeshStandardMaterial;
  garage: MeshStandardMaterial;
  garageLine: MeshStandardMaterial;
  bush: MeshStandardMaterial;
}

/** Materiales de la casa y el suelo; las texturas (revestimiento, césped, hormigón) se cargan aquí. */
export function useHouseMaterials(): HouseMaterials {
  const aniso = Math.min(
    8,
    useThree((s) => s.gl.capabilities.getMaxAnisotropy()),
  );
  const siding = use(loadSurface('siding', aniso));
  const grass = use(loadSurface('grass', aniso));
  const concrete = use(loadSurface('concrete', aniso));
  return useMemo(() => {
    const textured = (t: typeof siding, color: Color, normalScale = 1): MeshStandardMaterial => {
      const m = new MeshStandardMaterial({
        color,
        map: t.color,
        normalMap: t.normal,
        aoMap: t.orm,
        roughnessMap: t.orm,
        metalnessMap: t.orm,
        roughness: 1,
        metalness: 1,
      });
      m.normalScale.set(normalScale, normalScale);
      return m;
    };
    const sidingColor = new Color(WALL_TINT).multiplyScalar(albedoGain.siding);
    const grassMat = textured(grass, new Color('#ffffff'));
    const fade = grassMat.clone();
    fade.vertexColors = true;
    fade.transparent = true;
    fade.depthWrite = false;
    const flat = (color: string, roughness = 0.6, metalness = 0) =>
      new MeshStandardMaterial({ color, roughness, metalness });
    return {
      siding: textured(siding, sidingColor),
      concrete: textured(concrete, new Color('#ffffff')),
      grass: grassMat,
      grassFade: fade,
      trim: flat('#f3f1ea', 0.55),
      aluminum: new MeshStandardMaterial({
        color: '#c8cbcf',
        roughness: 0.35,
        metalness: 0.9,
        side: DoubleSide,
      }),
      glass: new MeshPhysicalMaterial({
        color: '#17232b',
        roughness: 0.04,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        envMapIntensity: 1.8,
        ior: 1.5,
      }),
      door: flat('#37485a', 0.5),
      garage: flat('#e6e2d9', 0.6),
      garageLine: flat('#b9b4a8', 0.7),
      bush: flat('#3f5d33', 1),
    };
  }, [siding, grass, concrete]);
}

/** Caja con UV en metros (el mosaico de las texturas tiene tamaño real). */
function metricBox(w: number, h: number, d: number): BoxGeometry {
  const g = new BoxGeometry(w, h, d);
  const pos = g.attributes.position!;
  const nor = g.attributes.normal!;
  const uv = g.attributes.uv!;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    if (ax > 0.5) uv.setXY(i, pos.getZ(i), pos.getY(i));
    else if (ay > 0.5) uv.setXY(i, pos.getX(i), pos.getZ(i));
    else uv.setXY(i, pos.getX(i), pos.getY(i));
  }
  return g;
}

function MetricBox({
  size,
  position,
  material,
}: {
  size: [number, number, number];
  position: [number, number, number];
  material: MeshStandardMaterial;
}) {
  const [sx, sy, sz] = size;
  const geometry = useMemo(() => metricBox(sx, sy, sz), [sx, sy, sz]);
  return (
    <mesh position={position} geometry={geometry} material={material} castShadow receiveShadow />
  );
}

function Box({
  size,
  position,
  material,
  shadow = true,
}: {
  size: [number, number, number];
  position: [number, number, number];
  material: MeshStandardMaterial;
  shadow?: boolean;
}) {
  return (
    <mesh position={position} material={material} castShadow={shadow} receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

function Window({
  position,
  rotationY = 0,
  w,
  h,
  m,
}: {
  position: [number, number, number];
  rotationY?: number;
  w: number;
  h: number;
  m: HouseMaterials;
}) {
  const f = 0.07;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0, 0.012]} material={m.glass}>
        <planeGeometry args={[w - f, h - f]} />
      </mesh>
      <Box size={[w, f, 0.07]} position={[0, h / 2 - f / 2, 0.03]} material={m.trim} />
      <Box size={[w, f, 0.07]} position={[0, -h / 2 + f / 2, 0.03]} material={m.trim} />
      <Box size={[f, h, 0.07]} position={[-w / 2 + f / 2, 0, 0.03]} material={m.trim} />
      <Box size={[f, h, 0.07]} position={[w / 2 - f / 2, 0, 0.03]} material={m.trim} />
      <Box size={[0.04, h, 0.05]} position={[0, 0, 0.03]} material={m.trim} />
      <Box size={[w, 0.035, 0.05]} position={[0, 0.1, 0.03]} material={m.trim} />
      {/* Moldura superior y alféizar. */}
      <Box size={[w + 0.2, 0.09, 0.09]} position={[0, h / 2 + 0.07, 0.045]} material={m.trim} />
      <Box size={[w + 0.24, 0.05, 0.15]} position={[0, -h / 2 - 0.04, 0.075]} material={m.trim} />
    </group>
  );
}

function FrontDoor({ x, m }: { x: number; m: HouseMaterials }) {
  const wall = HOUSE.depth / 2;
  return (
    <group position={[x, 0, wall]}>
      <Box size={[0.95, 2.05, 0.05]} position={[0, 1.05, 0.03]} material={m.door} />
      <Box size={[0.07, 2.15, 0.07]} position={[-0.52, 1.07, 0.035]} material={m.trim} />
      <Box size={[0.07, 2.15, 0.07]} position={[0.52, 1.07, 0.035]} material={m.trim} />
      <Box size={[1.1, 0.08, 0.07]} position={[0, 2.16, 0.035]} material={m.trim} />
      <mesh position={[0.34, 1.0, 0.075]} material={m.aluminum} castShadow>
        <sphereGeometry args={[0.035, 12, 8]} />
      </mesh>
      <mesh position={[0, 1.62, 0.056]} material={m.glass}>
        <planeGeometry args={[0.55, 0.5]} />
      </mesh>
    </group>
  );
}

function GarageDoor({ x, w, m }: { x: number; w: number; m: HouseMaterials }) {
  const wall = HOUSE.depth / 2;
  const h = 2.1;
  return (
    <group position={[x, 0, wall]}>
      <Box size={[w, h, 0.05]} position={[0, h / 2 + 0.02, 0.03]} material={m.garage} />
      {[1, 2, 3].map((i) => (
        <Box
          key={i}
          size={[w, 0.025, 0.012]}
          position={[0, 0.02 + (h / 4) * i, 0.06]}
          material={m.garageLine}
          shadow={false}
        />
      ))}
      {[-1.5, -0.5, 0.5, 1.5].map((k) => (
        <mesh key={k} position={[(k * w) / 4.4, 1.82, 0.058]} material={m.glass}>
          <planeGeometry args={[(w / 4.4) * 0.8, 0.24]} />
        </mesh>
      ))}
      <Box size={[w + 0.2, 0.1, 0.08]} position={[0, h + 0.1, 0.04]} material={m.trim} />
      <Box
        size={[0.1, h + 0.1, 0.08]}
        position={[-w / 2 - 0.05, (h + 0.1) / 2, 0.04]}
        material={m.trim}
      />
      <Box
        size={[0.1, h + 0.1, 0.08]}
        position={[w / 2 + 0.05, (h + 0.1) / 2, 0.04]}
        material={m.trim}
      />
    </group>
  );
}

function Porch({ x, m }: { x: number; m: HouseMaterials }) {
  const z0 = HOUSE.depth / 2;
  const depth = 2.0;
  const width = 3.2;
  const zc = z0 + depth / 2;
  return (
    <group position={[x, 0, 0]}>
      <MetricBox size={[width, 0.15, depth]} position={[0, 0.075, zc]} material={m.concrete} />
      <MetricBox
        size={[width * 0.5, 0.12, 0.35]}
        position={[0, 0.06, z0 + depth + 0.17]}
        material={m.concrete}
      />
      {[-1, 1].map((s) => (
        <Box
          key={s}
          size={[0.15, 2.17, 0.15]}
          position={[s * (width / 2 - 0.15), 1.235, z0 + depth - 0.15]}
          material={m.trim}
        />
      ))}
      <Box size={[width + 0.1, 0.12, depth + 0.1]} position={[0, 2.38, zc]} material={m.trim} />
      <Box
        size={[width + 0.1, 0.22, 0.05]}
        position={[0, 2.33, z0 + depth + 0.07]}
        material={m.trim}
      />
    </group>
  );
}

function Bushes({ m }: { m: HouseMaterials }) {
  const z = HOUSE.depth / 2 + 0.55;
  const bushes: [number, number, number][] = [
    [-6.3, 0.45, 0.55],
    [-5.5, 0.38, 0.45],
    [-4.7, 0.42, 0.5],
    [-3.4, 0.36, 0.42],
    [0.9, 0.4, 0.48],
    [1.7, 0.36, 0.4],
    [-1.2 + 2.3, 0.3, 0.36],
  ];
  return (
    <group>
      {bushes.map(([x, y, r], i) => (
        <mesh
          key={i}
          position={[x, y, z + (i % 2) * 0.15]}
          scale={[r * 1.1, r * 0.8, r]}
          material={m.bush}
          castShadow
          receiveShadow
        >
          <icosahedronGeometry args={[1, 2]} />
        </mesh>
      ))}
    </group>
  );
}

const GRASS_INNER = 40;
const GRASS_OUTER = 130;

function circleGeometry(): CircleGeometry {
  const g = new CircleGeometry(GRASS_INNER, 72);
  const pos = g.attributes.position!;
  const uv = g.attributes.uv!;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i));
  return g;
}

/** Corona exterior del césped: el color se desvanece (alfa por vértice) hacia el cielo. */
function ringGeometry(): BufferGeometry {
  const g = new RingGeometry(GRASS_INNER - 0.05, GRASS_OUTER, 72, 6);
  const pos = g.attributes.position!;
  const uv = g.attributes.uv!;
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uv.setXY(i, x, y);
    const k = (Math.hypot(x, y) - GRASS_INNER) / (GRASS_OUTER - GRASS_INNER);
    const a = Math.max(0, 1 - Math.pow(Math.max(0, k), 0.8));
    colors.set([1, 1, 1, a * a], i * 4);
  }
  g.setAttribute('color', new BufferAttribute(colors, 4));
  return g;
}

export function Ground({ m }: { m: HouseMaterials }) {
  const inner = useMemo(circleGeometry, []);
  const outer = useMemo(ringGeometry, []);
  const front = HOUSE.depth / 2;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={inner} material={m.grass} receiveShadow />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.002, 0]}
        geometry={outer}
        material={m.grassFade}
        renderOrder={-1}
      />
      {/* Entrada de hormigón hasta el garaje y camino a la puerta. */}
      <MetricBox
        size={[4.9, 0.05, 15]}
        position={[4.7, 0.025, front + 7.5]}
        material={m.concrete}
      />
      <MetricBox
        size={[1.1, 0.04, 14]}
        position={[-1.2, 0.02, front + 2.0 + 7]}
        material={m.concrete}
      />
      {[3, 6, 9, 12].map((d) => (
        <Box
          key={d}
          size={[4.9, 0.052, 0.025]}
          position={[4.7, 0.026, front + d]}
          material={m.garageLine}
          shadow={false}
        />
      ))}
    </group>
  );
}

/** Casa ranch de una planta (≈ 15 × 9 m, muros de 2,7 m) modelada por código. */
export function House({ m }: { m: HouseMaterials }) {
  const { length: Lh, depth: D, wallHeight: H } = HOUSE;
  const wall = D / 2;
  const end = Lh / 2;
  return (
    <group>
      <MetricBox size={[Lh, H, D]} position={[0, H / 2, 0]} material={m.siding} />
      {/* Zócalo de hormigón. */}
      <MetricBox size={[Lh + 0.08, 0.32, D + 0.08]} position={[0, 0.16, 0]} material={m.concrete} />
      {/* Molduras de esquina. */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Box
            key={`c${sx}${sz}`}
            size={[0.13, H - 0.3, 0.13]}
            position={[sx * (end + 0.045), 0.32 + (H - 0.32) / 2, sz * (wall + 0.045)]}
            material={m.trim}
          />
        )),
      )}

      <FrontDoor x={-1.2} m={m} />
      <GarageDoor x={4.7} w={4.6} m={m} />
      <Porch x={-1.2} m={m} />

      {/* Ventanas: 2 en la fachada, 1 en cada extremo y 2 en la parte trasera. */}
      <Window position={[-5.4, 1.6, wall]} w={1.6} h={1.3} m={m} />
      <Window position={[1.2, 1.6, wall]} w={1.1} h={1.3} m={m} />
      <Window position={[-end, 1.6, 0]} rotationY={-Math.PI / 2} w={1.4} h={1.3} m={m} />
      <Window position={[end, 1.6, -0.5]} rotationY={Math.PI / 2} w={1.0} h={1.0} m={m} />
      <Window position={[-3, 1.6, -wall]} rotationY={Math.PI} w={1.5} h={1.3} m={m} />
      <Window position={[3, 1.6, -wall]} rotationY={Math.PI} w={1.5} h={1.3} m={m} />

      <Bushes m={m} />
    </group>
  );
}
