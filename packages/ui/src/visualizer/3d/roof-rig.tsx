import { useFrame, useThree } from '@react-three/fiber';
import type { RoofMaterialId, RoofShape } from '@roofing/shared/visualizer';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  type Mesh,
  type Material,
  type MeshStandardMaterial,
} from 'three';
import {
  appearanceFor,
  applyAppearance,
  createRoofMaterial,
  METAL_ID,
  syncMaterial,
  type Appearance,
  type RoofMaterialHandle,
} from './roof-materials';
import {
  buildRibsData,
  buildRoofData,
  easeInOutCubic,
  gableInfillPolygon,
  roofDerived,
  ROOF_PARAMS,
  type RoofData,
} from './roof-geometry';
import { releaseSurface } from './textures';
import { EaveDetails } from './eave-details';

export const SHAPE_MS = 900;
export const WIPE_MS = 1100;
export const COLOR_MS = 400;

function toGeometry(d: RoofData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(d.positions, 3));
  g.setAttribute('normal', new BufferAttribute(d.normals, 3));
  g.setAttribute('uv', new BufferAttribute(d.uvs, 2));
  // Segundo juego de UV (iguales) para el mapa de oclusión ambiental.
  g.setAttribute('uv1', new BufferAttribute(d.uvs.slice(), 2));
  g.setIndex(new BufferAttribute(d.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function infillGeometry(poly: [number, number][], x: number): BufferGeometry | null {
  if (poly.length < 3) return null;
  const sign = Math.sign(x);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // Antihorario visto desde fuera (+x: z decreciente a la izquierda → orden según el signo).
  const pts = (sign > 0 ? [...poly].reverse() : poly).map(([z, y]): [number, number] => [
    z,
    y - (Math.abs(y - poly[0]![1]) < 1e-6 ? 0.06 : 0),
  ]);
  // Las dos primeras (base) bajan un poco para solaparse con el muro sin hueco.
  for (const [z, y] of pts) {
    positions.push(x, y, z);
    normals.push(sign, 0, 0);
    uvs.push(z, y);
  }
  for (let i = 1; i < pts.length - 1; i++) indices.push(0, i, i + 1);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(indices);
  return g;
}

export interface RoofRigProps {
  shape: RoofShape;
  materialId: RoofMaterialId;
  colorId: string;
  hex: string;
  reduced: boolean;
  anisotropy: number;
  wallMaterial: MeshStandardMaterial;
  trimMaterial: Material;
  metalTrimMaterial: Material;
  onReady: () => void;
}

interface Fade {
  from: Appearance;
  to: Appearance;
  elapsed: number;
}

interface Wipe {
  old: RoofMaterialHandle;
  nw: RoofMaterialHandle;
  elapsed: number;
}

const cloneAppearance = (a: Appearance): Appearance => ({ ...a, color: a.color.clone() });

/**
 * Techo paramétrico con sus transiciones (T21): deformación entre dos y cuatro aguas, barrido de
 * reinstalación al cambiar de material y fundido al cambiar de color. Todo parte del estado actual
 * y es instantáneo con "reducir movimiento".
 */
export function RoofRig(props: RoofRigProps) {
  const { shape, materialId, colorId, hex, reduced, anisotropy } = props;
  const invalidate = useThree((s) => s.invalidate);

  const [layers, setLayers] = useState<{
    current: RoofMaterialHandle | null;
    prev: RoofMaterialHandle | null;
  }>({
    current: null,
    prev: null,
  });
  const [ends, setEnds] = useState(shape === 'hip');

  const sim = useRef({
    t: shape === 'hip' ? 1 : 0,
    tFrom: 0,
    tTo: shape === 'hip' ? 1 : 0,
    tElapsed: 0,
    tActive: false,
    current: null as RoofMaterialHandle | null,
    token: 0,
    fade: null as Fade | null,
    wipe: null as Wipe | null,
    ready: false,
    ends: shape === 'hip',
  });
  const geo = useRef<{ roof: BufferGeometry | null; ribs: BufferGeometry | null }>({
    roof: null,
    ribs: null,
  });
  const roofMeshes = useRef(new Set<Mesh>());
  const ribMeshes = useRef(new Set<Mesh>());
  const infill = useRef<[Mesh | null, Mesh | null]>([null, null]);
  const onReadyRef = useRef(props.onReady);
  onReadyRef.current = props.onReady;

  const metalVisible = () => {
    const s = sim.current;
    return s.current?.id === METAL_ID || s.wipe?.old.id === METAL_ID;
  };

  const rebuild = useCallback(() => {
    const s = sim.current;
    const params = { ...ROOF_PARAMS, hipInset: s.t };
    const prev = geo.current;
    const roof = toGeometry(buildRoofData(params));
    const ribs = metalVisible() ? toGeometry(buildRibsData(params)) : null;
    geo.current = { roof, ribs };
    for (const m of roofMeshes.current) m.geometry = roof;
    for (const m of ribMeshes.current) m.geometry = ribs ?? roof;
    prev.roof?.dispose();
    prev.ribs?.dispose();
    const poly = gableInfillPolygon(params);
    [-1, 1].forEach((sign, i) => {
      const mesh = infill.current[i];
      if (!mesh) return;
      const g = infillGeometry(poly, sign * 7.505);
      const old = mesh.geometry;
      if (g) mesh.geometry = g;
      mesh.visible = !!g;
      if (g) old.dispose();
    });
    const hasEnds = roofDerived(params).hasEnds;
    if (hasEnds !== s.ends) {
      s.ends = hasEnds;
      setEnds(hasEnds);
    }
    invalidate();
  }, [invalidate]);

  // Geometría inicial (antes del primer render del techo).
  if (!geo.current.roof) {
    const params = { ...ROOF_PARAMS, hipInset: sim.current.t };
    geo.current = { roof: toGeometry(buildRoofData(params)), ribs: null };
  }

  const releaseHandle = useCallback((h: RoofMaterialHandle) => {
    h.material.dispose();
    if (h.surface) releaseSurface(h.surface);
  }, []);

  const finishWipe = useCallback(() => {
    const s = sim.current;
    const w = s.wipe;
    if (!w) return;
    w.old.wipe.mode.value = 0;
    w.nw.wipe.mode.value = 0;
    s.wipe = null;
    // Se libera un instante después para que ningún fotograma pinte la malla ya retirada.
    setTimeout(() => releaseHandle(w.old), 250);
    setLayers({ current: s.current, prev: null });
  }, [releaseHandle]);

  // Cambios de material y de color.
  useEffect(() => {
    const s = sim.current;
    const target = appearanceFor(materialId, colorId, hex);

    if (s.current?.id === materialId) {
      // Solo cambia el color: fundido desde el aspecto actual (y se cancela una carga pendiente).
      s.token++;
      if (reduced) {
        applyAppearance(s.current, target);
        s.fade = null;
      } else {
        s.fade = { from: cloneAppearance(s.current.appearance), to: target, elapsed: 0 };
      }
      invalidate();
      return;
    }

    const token = ++s.token;
    createRoofMaterial(materialId, anisotropy)
      .then((handle) => {
        if (token !== s.token) {
          releaseHandle(handle);
          return;
        }
        applyAppearance(handle, target);
        s.fade = null;
        if (!s.current) {
          s.current = handle;
          setLayers({ current: handle, prev: null });
          rebuild();
          if (!s.ready) {
            s.ready = true;
            // Dos fotogramas para que la textura suba a la GPU antes de retirar la carga.
            requestAnimationFrame(() => requestAnimationFrame(() => onReadyRef.current()));
          }
          return;
        }
        finishWipe();
        const old = s.current;
        s.current = handle;
        if (reduced) {
          setLayers({ current: handle, prev: null });
          setTimeout(() => releaseHandle(old), 250);
          rebuild();
        } else {
          old.wipe.mode.value = 1;
          handle.wipe.mode.value = 2;
          old.wipe.front.value = handle.wipe.front.value = ROOF_PARAMS.eaveY - 1;
          s.wipe = { old, nw: handle, elapsed: 0 };
          setLayers({ current: handle, prev: old });
          rebuild();
        }
        invalidate();
      })
      .catch(() => {
        // Sin textura no hay techo nuevo: se conserva el estado anterior.
      });
  }, [
    materialId,
    colorId,
    hex,
    reduced,
    anisotropy,
    invalidate,
    rebuild,
    finishWipe,
    releaseHandle,
  ]);

  // Cambio de forma.
  useEffect(() => {
    const s = sim.current;
    const to = shape === 'hip' ? 1 : 0;
    if (to === s.tTo && !s.tActive) return;
    s.tTo = to;
    if (reduced) {
      s.t = to;
      s.tActive = false;
      rebuild();
      return;
    }
    s.tFrom = s.t;
    s.tElapsed = 0;
    s.tActive = true;
    invalidate();
  }, [shape, reduced, invalidate, rebuild]);

  useFrame((_, rawDelta) => {
    const s = sim.current;
    const dt = Math.min(rawDelta, 0.05) * 1000;
    let busy = false;

    if (s.tActive) {
      s.tElapsed += dt;
      const p = Math.min(1, s.tElapsed / SHAPE_MS);
      s.t = s.tFrom + (s.tTo - s.tFrom) * easeInOutCubic(p);
      if (p >= 1) {
        s.t = s.tTo;
        s.tActive = false;
      } else busy = true;
      rebuild();
    }

    if (s.fade && s.current) {
      s.fade.elapsed += dt;
      const p = Math.min(1, s.fade.elapsed / COLOR_MS);
      const e = easeInOutCubic(p);
      const a = s.current.appearance;
      const { from, to } = s.fade;
      a.color.copy(from.color).lerp(to.color, e);
      a.metalness = from.metalness + (to.metalness - from.metalness) * e;
      a.roughness = from.roughness + (to.roughness - from.roughness) * e;
      a.clearcoat = from.clearcoat + (to.clearcoat - from.clearcoat) * e;
      syncMaterial(s.current);
      if (p >= 1) s.fade = null;
      else busy = true;
    }

    if (s.wipe) {
      s.wipe.elapsed += dt;
      const p = Math.min(1, s.wipe.elapsed / WIPE_MS);
      const band = s.wipe.nw.wipe.band.value;
      const y0 = ROOF_PARAMS.eaveY - band;
      const y1 = roofDerived({ ...ROOF_PARAMS, hipInset: 0 }).ridgeY + band + 0.15;
      const front = y0 + (y1 - y0) * easeInOutCubic(p);
      s.wipe.old.wipe.front.value = front;
      s.wipe.nw.wipe.front.value = front;
      if (p >= 1) {
        finishWipe();
        rebuild();
      } else busy = true;
    }

    if (busy) invalidate();
  });

  useEffect(() => {
    const g = geo.current;
    return () => {
      g.roof?.dispose();
      g.ribs?.dispose();
    };
  }, []);

  const renderSurface = (h: RoofMaterialHandle) => (
    <group key={h.id}>
      <mesh
        ref={(m) => {
          if (!m) return;
          roofMeshes.current.add(m);
          m.geometry = geo.current.roof!;
        }}
        material={h.material}
        castShadow
        receiveShadow
      />
      {h.id === METAL_ID && (
        <mesh
          ref={(m) => {
            if (!m) return;
            ribMeshes.current.add(m);
            m.geometry = geo.current.ribs ?? geo.current.roof!;
            if (!geo.current.ribs) queueMicrotask(rebuild);
          }}
          material={h.material}
          castShadow
          receiveShadow
        />
      )}
    </group>
  );

  // Limpieza de referencias a mallas desmontadas.
  useEffect(() => {
    for (const set of [roofMeshes.current, ribMeshes.current]) {
      for (const m of set) if (!m.parent) set.delete(m);
    }
  }, [layers]);

  return (
    <group>
      {layers.prev && renderSurface(layers.prev)}
      {layers.current && renderSurface(layers.current)}
      {[-1, 1].map((sign, i) => (
        <mesh
          key={sign}
          ref={(m) => {
            infill.current[i] = m;
          }}
          material={props.wallMaterial}
          castShadow
          receiveShadow
          visible={false}
        />
      ))}
      <EaveDetails ends={ends} trim={props.trimMaterial} metal={props.metalTrimMaterial} />
    </group>
  );
}
