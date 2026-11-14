import {
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';
import { surfaceUrls, type SurfaceId } from './assets';

/** Tamaño real del mosaico (ancho × alto, en metros). Las UV de la escena están en metros. */
export const TILE_SIZE: Record<SurfaceId, readonly [number, number]> = {
  'three-tab-shingle': [3.07, 2.03],
  'architectural-shingle': [3.0, 2.29],
  'clay-tile': [2.9, 2.9],
  // 25 hileras de pizarra (≈ 18 cm de exposición) en el alto del mosaico.
  slate: [4.5, 4.5],
  'cedar-shake': [1.4, 1.4],
  siding: [2.4, 1.2],
  grass: [1.4, 1.4],
  concrete: [2.5, 2.5],
};

export interface SurfaceTextures {
  color: Texture;
  normal: Texture;
  /** R = oclusión ambiental, G = rugosidad, B = metal. */
  orm: Texture;
}

const loader = new TextureLoader();
const cache = new Map<SurfaceId, Promise<SurfaceTextures>>();
const resolved = new Map<SurfaceId, SurfaceTextures>();

function configure(tex: Texture, id: SurfaceId, srgb: boolean, anisotropy: number) {
  const [w, h] = TILE_SIZE[id];
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(1 / w, 1 / h);
  tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  tex.anisotropy = anisotropy;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

/** Referencias vivas de cada superficie: cada `loadSurface` que resuelve suma una. */
const refs = new Map<SurfaceId, number>();

/**
 * Carga (una sola vez) los tres mapas de una superficie y toma una referencia: quien la reciba
 * debe llamar a `releaseSurface` exactamente una vez cuando deje de usarla. Si la carga falla no
 * queda ninguna referencia.
 */
export function loadSurface(id: SurfaceId, anisotropy = 8): Promise<SurfaceTextures> {
  refs.set(id, (refs.get(id) ?? 0) + 1);
  const hit = cache.get(id);
  if (hit) return hit;
  const urls = surfaceUrls[id];
  const promise: Promise<SurfaceTextures> = Promise.all([
    loader.loadAsync(urls.color),
    loader.loadAsync(urls.normal),
    loader.loadAsync(urls.orm),
  ]).then(
    ([color, normal, orm]) => {
      const set = {
        color: configure(color, id, true, anisotropy),
        normal: configure(normal, id, false, anisotropy),
        orm: configure(orm, id, false, anisotropy),
      };
      resolved.set(id, set);
      return set;
    },
    (error: unknown) => {
      if (cache.get(id) === promise) {
        cache.delete(id);
        refs.delete(id);
      }
      throw error;
    },
  );
  cache.set(id, promise);
  return promise;
}

/**
 * Suelta una referencia de la superficie; al llegar a 0 libera la memoria de vídeo (se volverá a
 * cargar si hace falta).
 */
export function releaseSurface(id: SurfaceId) {
  const left = (refs.get(id) ?? 0) - 1;
  if (left > 0) {
    refs.set(id, left);
    return;
  }
  refs.delete(id);
  const set = resolved.get(id);
  if (!set) return;
  set.color.dispose();
  set.normal.dispose();
  set.orm.dispose();
  resolved.delete(id);
  cache.delete(id);
}

const warmed = new Set<string>();

/**
 * Precarga el resto de materiales en reposo: solo calienta la caché HTTP (no ocupa memoria de
 * vídeo), así el cambio de material posterior apenas espera.
 */
export function preloadSurfaces(ids: readonly SurfaceId[]) {
  const run = (cb: () => void) =>
    typeof requestIdleCallback === 'function'
      ? requestIdleCallback(cb, { timeout: 4000 })
      : setTimeout(cb, 1500);
  const queue = ids.flatMap((id) => Object.values(surfaceUrls[id])).filter((u) => !warmed.has(u));
  const next = () => {
    const url = queue.shift();
    if (!url) return;
    warmed.add(url);
    fetch(url)
      .then((r) => r.blob())
      .catch(() => undefined)
      .finally(() => run(next));
  };
  run(next);
}
