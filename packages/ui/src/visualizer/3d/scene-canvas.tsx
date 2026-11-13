import { CameraControls, CameraControlsImpl, Environment, useProgress } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing';
import { Suspense, useCallback, type ComponentProps, useEffect, useMemo, useRef } from 'react';
import { AgXToneMapping, Euler, MathUtils, Vector3 } from 'three';
import { hdrUrl } from './assets';
import { House, Ground, useHouseMaterials } from './house';
import { RoofRig } from './roof-rig';
import { preloadSurfaces } from './textures';
import { VIEWS, type Scene3DProps, type ViewId } from './types';

/** `ToneMappingMode.AGX` de `postprocessing` (dependencia transitiva: se evita importarla directamente). */
const TONE_MAPPING_AGX = 8 as NonNullable<ComponentProps<typeof ToneMapping>['mode']>;

const FOV = 28;
const TARGET: [number, number, number] = [0, 2.0, 0];

/** Posición del sol en el HDRI (elevación ≈ 48°, azimut ≈ 34° en el mapa equirrectangular). */
const HDRI_SUN = new Vector3(0.554, 0.743, 0.376);
/** Se gira el HDRI para que el sol caiga delante-derecha de la fachada (cámara «Esquina»). */
const HDRI_YAW = MathUtils.degToRad(-26);
const SUN_DIR = HDRI_SUN.clone()
  .applyEuler(new Euler(0, HDRI_YAW, 0))
  .normalize();

interface Quality {
  mobile: boolean;
  dpr: [number, number];
  shadowSize: number;
}

function detectQuality(): Quality {
  const mobile =
    window.innerWidth < 768 ||
    (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4);
  return {
    mobile,
    dpr: mobile ? [1, 1.5] : [1, 2],
    shadowSize: mobile ? 2048 : 4096,
  };
}

/** Distancia de la cámara para que quepa la casa (≈ 17 m) también en pantallas estrechas. */
function fitDistance(aspect: number) {
  const tanHalf = Math.tan(MathUtils.degToRad(FOV) / 2) * aspect;
  return MathUtils.clamp(11.5 / tanHalf, 28, 62);
}

function viewPosition(view: ViewId, dist: number): [number, number, number] {
  const az = MathUtils.degToRad(VIEWS[view].azimuth);
  const polar = MathUtils.degToRad(VIEWS[view].polar);
  return [
    TARGET[0] + dist * Math.sin(polar) * Math.sin(az),
    TARGET[1] + dist * Math.cos(polar),
    TARGET[2] + dist * Math.sin(polar) * Math.cos(az),
  ];
}

const ACTION = CameraControlsImpl.ACTION;

function CameraRig({
  view,
  reduced,
  onUserRotate,
}: Pick<Scene3DProps, 'view' | 'reduced' | 'onUserRotate'>) {
  const controls = useRef<CameraControlsImpl>(null);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const dist = fitDistance(aspect);
  const first = useRef(true);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Posición inicial y vistas con botones.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.minDistance = c.maxDistance = dist;
    const target = view ?? 'corner';
    if (first.current) {
      first.current = false;
      const p = viewPosition(target, dist);
      void c.setLookAt(...p, ...TARGET, false);
    } else if (view) {
      void c.rotateTo(
        MathUtils.degToRad(VIEWS[view].azimuth),
        MathUtils.degToRad(VIEWS[view].polar),
        !reduced,
      );
      void c.dollyTo(dist, !reduced);
    } else {
      void c.dollyTo(dist, false);
    }
    invalidate();
  }, [view, dist, reduced, invalidate]);

  // `touch-action: pan-y`: el desplazamiento vertical es de la página; con un dedo solo gira en horizontal.
  useEffect(() => {
    const el = gl.domElement;
    const apply = () => {
      el.style.touchAction = 'pan-y';
    };
    apply();
    const id = requestAnimationFrame(apply);
    const onDown = (e: PointerEvent) => {
      const c = controls.current;
      if (c) c.polarRotateSpeed = e.pointerType === 'touch' ? 0 : 1;
    };
    el.addEventListener('pointerdown', onDown);
    const redraw = () => invalidate();
    const c = controls.current;
    c?.addEventListener('update', redraw);
    return () => {
      cancelAnimationFrame(id);
      el.removeEventListener('pointerdown', onDown);
      c?.removeEventListener('update', redraw);
    };
  }, [gl, invalidate]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minAzimuthAngle={MathUtils.degToRad(-70)}
      maxAzimuthAngle={MathUtils.degToRad(70)}
      minPolarAngle={MathUtils.degToRad(25)}
      maxPolarAngle={MathUtils.degToRad(88)}
      smoothTime={0.35}
      draggingSmoothTime={0.1}
      dollyToCursor={false}
      mouseButtons={{
        left: ACTION.ROTATE,
        middle: ACTION.NONE,
        right: ACTION.NONE,
        wheel: ACTION.NONE,
      }}
      touches={{ one: ACTION.TOUCH_ROTATE, two: ACTION.NONE, three: ACTION.NONE }}
      onStart={onUserRotate}
    />
  );
}

/** Pide un redibujado cada vez que avanza la carga (frameloop bajo demanda). */
function Redraw() {
  const invalidate = useThree((s) => s.invalidate);
  const { progress } = useProgress();
  useEffect(() => invalidate(), [progress, invalidate]);
  return null;
}

function Contents({
  props,
  quality,
  onReady,
}: {
  props: Scene3DProps;
  quality: Quality;
  onReady: () => void;
}) {
  const m = useHouseMaterials();
  const gl = useThree((s) => s.gl);
  const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const sunPos = useMemo(() => SUN_DIR.clone().multiplyScalar(60), []);
  return (
    <>
      <Environment
        files={hdrUrl}
        background
        backgroundIntensity={1.5}
        environmentRotation={[0, HDRI_YAW, 0]}
        backgroundRotation={[0, HDRI_YAW, 0]}
        environmentIntensity={1}
      />
      <directionalLight
        position={sunPos}
        intensity={2.8}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[quality.shadowSize, quality.shadowSize]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={10}
        shadow-camera-far={120}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={4}
      />
      <House m={m} />
      <Ground m={m} />
      <RoofRig
        shape={props.shape}
        materialId={props.materialId}
        colorId={props.colorId}
        hex={props.hex}
        reduced={props.reduced}
        anisotropy={anisotropy}
        wallMaterial={m.siding}
        trimMaterial={m.trim}
        metalTrimMaterial={m.aluminum}
        onReady={onReady}
      />
      <CameraRig view={props.view} reduced={props.reduced} onUserRotate={props.onUserRotate} />
      <EffectComposer multisampling={4}>
        <N8AO
          aoRadius={1.1}
          distanceFalloff={1.2}
          intensity={2.4}
          quality={quality.mobile ? 'low' : 'medium'}
          halfRes={quality.mobile}
          screenSpaceRadius={false}
        />
        <ToneMapping mode={TONE_MAPPING_AGX} />
      </EffectComposer>
      <Redraw />
    </>
  );
}

/** Escena 3D del visualizador (se carga con `React.lazy`, en un chunk aparte). */
export default function RoofScene3D(props: Scene3DProps) {
  const quality = useMemo(detectQuality, []);
  const { progress } = useProgress();
  const { onProgress, onReady: notifyReady } = props;
  useEffect(() => onProgress(progress), [progress, onProgress]);
  const onReady = useCallback(() => {
    notifyReady();
    // Resto de materiales en reposo (solo caché HTTP).
    preloadSurfaces(['three-tab-shingle', 'clay-tile', 'slate', 'cedar-shake']);
  }, [notifyReady]);
  const { onError } = props;
  const handleCreated = useCallback(
    (state: { gl: { domElement: HTMLCanvasElement } }) => {
      state.gl.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        onError();
      });
    },
    [onError],
  );

  return (
    <>
      <Canvas
        frameloop="demand"
        shadows
        dpr={quality.dpr}
        camera={{ fov: FOV, near: 1, far: 400, position: viewPosition('corner', 34) }}
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          toneMapping: AgXToneMapping,
        }}
        style={{ touchAction: 'pan-y' }}
        onCreated={handleCreated}
      >
        <Suspense fallback={null}>
          <Contents props={props} quality={quality} onReady={onReady} />
        </Suspense>
      </Canvas>
    </>
  );
}
