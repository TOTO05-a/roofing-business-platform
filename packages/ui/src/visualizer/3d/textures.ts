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
  slate: [2.0, 2.0],
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

/** Carga (una sola vez) los tres mapas de una superficie. */
export function loadSurface(id: SurfaceId, anisotropy = 8): Promise<SurfaceTextures> {
  const hit = cache.get(id);
  if (hit) return hit;
  const urls = surfaceUrls[id];
  const promise = Promise.all([
    loader.loadAsync(urls.color),
    loader.loadAsync(urls.normal),
    loader.loadAsync(urls.orm),
  ]).then(([color, normal, orm]) => {
    const set = {
      color: configure(color, id, true, anisotropy),
      normal: configure(normal, id, false, anisotropy),
      orm: configure(orm, id, false, anisotropy),
    };
    resolved.set(id, set);
    return set;
  });
  promise.catch(() => cache.delete(id));
  cache.set(id, promise);
  return promise;
}

/** Libera la memoria de vídeo de una superficie (se volverá a cargar si hace falta). */
export function releaseSurface(id: SurfaceId) {
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
