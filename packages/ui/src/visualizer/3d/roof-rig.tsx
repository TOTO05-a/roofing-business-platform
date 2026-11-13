import { useFrame, useThree } from '@react-three/fiber';
import type { RoofMaterialId, RoofShape } from '@roofing/shared/visualizer';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
} from './roof-geometry';
import { releaseSurface } from './textures';
import { EaveDetails } from './eave-details';
import { toGeometry, updateGeometry } from './roof-buffers';
import {
  accelerateWipe,
  advanceWipe,
  COLOR_MS,
  createShapeAnim,
  retargetShape,
  SHAPE_MS,
  stepShape,
  WIPE_MS,
  type ShapeAnim,
  type WipeClock,
} from './transitions';

export { COLOR_MS, SHAPE_MS, WIPE_MS };

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
  /** La carga inicial del techo falló (sin texturas no hay escena útil). */
  onError: () => void;
}

interface Fade {
  from: Appearance;
  to: Appearance;
  elapsed: number;
}

interface Wipe extends WipeClock {
  old: RoofMaterialHandle;
  nw: RoofMaterialHandle;
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
    shape: createShapeAnim(shape === 'hip' ? 1 : 0) as ShapeAnim,
    current: null as RoofMaterialHandle | null,
    /** Material ya cargado que espera a que termine el barrido en curso. */
    pending: null as RoofMaterialHandle | null,
    mounted: true,
    released: new WeakSet<RoofMaterialHandle>(),
    timers: new Map<ReturnType<typeof setTimeout>, RoofMaterialHandle>(),
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
  const onErrorRef = useRef(props.onError);
  onErrorRef.current = props.onError;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const metalVisible = () => {
    const s = sim.current;
    return s.current?.id === METAL_ID || s.wipe?.old.id === METAL_ID;
  };

  const rebuild = useCallback(() => {
    const s = sim.current;
    const params = { ...ROOF_PARAMS, hipInset: s.shape.t };
    const prev = geo.current;
    // Si el número de vértices no cambia se reutilizan los atributos; si cambia, se regenera.
    const roofData = buildRoofData(params);
    const roofNext = prev.roof ? updateGeometry(prev.roof, roofData) : toGeometry(roofData);
    const ribsData = metalVisible() ? buildRibsData(params) : null;
    const ribs = ribsData
      ? prev.ribs
        ? updateGeometry(prev.ribs, ribsData)
        : toGeometry(ribsData)
      : null;
    geo.current = { roof: roofNext, ribs };
    for (const m of roofMeshes.current) if (m.geometry !== roofNext) m.geometry = roofNext;
    for (const m of ribMeshes.current) {
      const g = ribs ?? roofNext;
      if (m.geometry !== g) m.geometry = g;
    }
    if (prev.roof && prev.roof !== roofNext) prev.roof.dispose();
    if (prev.ribs && prev.ribs !== ribs) prev.ribs.dispose();
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
    const params = { ...ROOF_PARAMS, hipInset: sim.current.shape.t };
    geo.current = { roof: toGeometry(buildRoofData(params)), ribs: null };
  }

  /** Libera un material y su superficie exactamente una vez, aunque se pida más de una. */
  const releaseHandle = useCallback((h: RoofMaterialHandle) => {
    const { released } = sim.current;
    if (released.has(h)) return;
    released.add(h);
    h.material.dispose();
    if (h.surface) releaseSurface(h.surface);
  }, []);

  /** Libera un material un instante después, para que ningún fotograma pinte la malla retirada. */
  const releaseLater = useCallback(
    (h: RoofMaterialHandle) => {
      const { timers } = sim.current;
      const id = setTimeout(() => {
        timers.delete(id);
        releaseHandle(h);
      }, 250);
      timers.set(id, h);
    },
    [releaseHandle],
  );

  const finishWipe = useCallback(() => {
    const s = sim.current;
    const w = s.wipe;
    if (!w) return;
    w.old.wipe.mode.value = 0;
    w.nw.wipe.mode.value = 0;
    s.wipe = null;
    releaseLater(w.old);
    setLayers({ current: s.current, prev: null });
  }, [releaseLater]);

  /** Empieza el barrido (o el cambio instantáneo) del material actual al `handle` ya cargado. */
  const swapTo = useCallback(
    (handle: RoofMaterialHandle) => {
      const s = sim.current;
      const old = s.current!;
      s.current = handle;
      if (reducedRef.current) {
        setLayers({ current: handle, prev: null });
        releaseLater(old);
      } else {
        old.wipe.mode.value = 1;
        handle.wipe.mode.value = 2;
        old.wipe.front.value = handle.wipe.front.value = ROOF_PARAMS.eaveY - 1;
        s.wipe = { old, nw: handle, p: 0, rate: 1 };
        setLayers({ current: handle, prev: old });
      }
      rebuild();
    },
    [rebuild, releaseLater],
  );

  const dropPending = useCallback(() => {
    const s = sim.current;
    if (s.pending) releaseHandle(s.pending);
    s.pending = null;
  }, [releaseHandle]);

  // Cambios de material y de color.
  useEffect(() => {
    const s = sim.current;
    const target = appearanceFor(materialId, colorId, hex);
    dropPending();

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
        if (!s.mounted || token !== s.token) {
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
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                if (s.mounted) onReadyRef.current();
              }),
            );
          }
          return;
        }
        if (s.wipe) {
          if (reduced) {
            finishWipe();
          } else {
            // Barrido en curso: se acelera hasta completarlo y el nuevo encadena después, sin saltos.
            s.pending = handle;
            s.wipe = { ...s.wipe, ...accelerateWipe(s.wipe) };
            invalidate();
            return;
          }
        }
        swapTo(handle);
        invalidate();
      })
      .catch((error: unknown) => {
        console.error('No se pudo cargar el material del techo', error);
        if (!s.mounted || token !== s.token) return;
        // Carga inicial: aviso sin WebGL. Cargas posteriores: se conserva el techo anterior.
        if (!s.current) onErrorRef.current();
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
    dropPending,
    swapTo,
  ]);

  // Cambio de forma.
  useEffect(() => {
    const s = sim.current;
    const next = retargetShape(s.shape, shape === 'hip' ? 1 : 0, reduced);
    if (next === s.shape) return;
    s.shape = next;
    if (next.active) invalidate();
    else rebuild();
  }, [shape, reduced, invalidate, rebuild]);

  useFrame((_, rawDelta) => {
    const s = sim.current;
    const dt = Math.min(rawDelta, 0.05) * 1000;
    let busy = false;

    if (s.shape.active) {
      s.shape = stepShape(s.shape, dt);
      if (s.shape.active) busy = true;
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
      const clock = advanceWipe(s.wipe, dt);
      s.wipe.p = clock.p;
      const band = s.wipe.nw.wipe.band.value;
      const y0 = ROOF_PARAMS.eaveY - band;
      const y1 = roofDerived({ ...ROOF_PARAMS, hipInset: 0 }).ridgeY + band + 0.15;
      const front = y0 + (y1 - y0) * easeInOutCubic(clock.p);
      s.wipe.old.wipe.front.value = front;
      s.wipe.nw.wipe.front.value = front;
      if (clock.p >= 1) {
        finishWipe();
        const next = s.pending;
        s.pending = null;
        if (next) {
          swapTo(next);
          busy = true;
        } else rebuild();
      } else busy = true;
    }

    if (busy) invalidate();
  });

  // Al desmontar: se invalida todo lo pendiente y se libera lo que sigue vivo.
  useEffect(() => {
    const s = sim.current;
    s.mounted = true;
    return () => {
      s.mounted = false;
      s.token++;
      for (const [id, h] of s.timers) {
        clearTimeout(id);
        releaseHandle(h);
      }
      s.timers.clear();
      for (const h of [s.current, s.wipe?.old, s.wipe?.nw, s.pending]) if (h) releaseHandle(h);
      s.current = null;
      s.wipe = null;
      s.pending = null;
      s.fade = null;
      s.ready = false;
      const g = geo.current;
      g.roof?.dispose();
      g.ribs?.dispose();
      for (const mesh of infill.current) mesh?.geometry.dispose();
    };
  }, [releaseHandle]);

  // Las mallas de metal necesitan la geometría de los nervios en cuanto aparecen.
  const metalShown = layers.current?.id === METAL_ID || layers.prev?.id === METAL_ID;
  useLayoutEffect(() => {
    if (metalShown && !geo.current.ribs) rebuild();
  }, [metalShown, rebuild]);

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
