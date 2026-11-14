/* Archivos empaquetados por Vite/Astro con `?url` (sin cargarlos hasta que se usan). */
import hdrUrl from './assets/kloofendal_48d_partly_cloudy_puresky_2k.hdr?url';
import gains from './assets/textures/albedo-gain.json';
import architectural_shingle_color from './assets/textures/architectural-shingle-color.webp?url';
import architectural_shingle_normal from './assets/textures/architectural-shingle-normal.webp?url';
import architectural_shingle_orm from './assets/textures/architectural-shingle-orm.webp?url';
import three_tab_shingle_color from './assets/textures/three-tab-shingle-color.webp?url';
import three_tab_shingle_normal from './assets/textures/three-tab-shingle-normal.webp?url';
import three_tab_shingle_orm from './assets/textures/three-tab-shingle-orm.webp?url';
import clay_tile_color from './assets/textures/clay-tile-color.webp?url';
import clay_tile_normal from './assets/textures/clay-tile-normal.webp?url';
import clay_tile_orm from './assets/textures/clay-tile-orm.webp?url';
import slate_color from './assets/textures/slate-color.webp?url';
import slate_normal from './assets/textures/slate-normal.webp?url';
import slate_orm from './assets/textures/slate-orm.webp?url';
import cedar_shake_color from './assets/textures/cedar-shake-color.webp?url';
import cedar_shake_normal from './assets/textures/cedar-shake-normal.webp?url';
import cedar_shake_orm from './assets/textures/cedar-shake-orm.webp?url';
import siding_color from './assets/textures/siding-color.webp?url';
import siding_normal from './assets/textures/siding-normal.webp?url';
import siding_orm from './assets/textures/siding-orm.webp?url';
import grass_color from './assets/textures/grass-color.webp?url';
import grass_normal from './assets/textures/grass-normal.webp?url';
import grass_orm from './assets/textures/grass-orm.webp?url';
import concrete_color from './assets/textures/concrete-color.webp?url';
import concrete_normal from './assets/textures/concrete-normal.webp?url';
import concrete_orm from './assets/textures/concrete-orm.webp?url';

export { hdrUrl };

export type SurfaceId =
  | 'architectural-shingle'
  | 'three-tab-shingle'
  | 'clay-tile'
  | 'slate'
  | 'cedar-shake'
  | 'siding'
  | 'grass'
  | 'concrete';

export interface SurfaceUrls {
  color: string;
  normal: string;
  orm: string;
}

export const surfaceUrls: Record<SurfaceId, SurfaceUrls> = {
  'architectural-shingle': {
    color: architectural_shingle_color,
    normal: architectural_shingle_normal,
    orm: architectural_shingle_orm,
  },
  'three-tab-shingle': {
    color: three_tab_shingle_color,
    normal: three_tab_shingle_normal,
    orm: three_tab_shingle_orm,
  },
  'clay-tile': { color: clay_tile_color, normal: clay_tile_normal, orm: clay_tile_orm },
  slate: { color: slate_color, normal: slate_normal, orm: slate_orm },
  'cedar-shake': { color: cedar_shake_color, normal: cedar_shake_normal, orm: cedar_shake_orm },
  siding: { color: siding_color, normal: siding_normal, orm: siding_orm },
  grass: { color: grass_color, normal: grass_normal, orm: grass_orm },
  concrete: { color: concrete_color, normal: concrete_normal, orm: concrete_orm },
};

/** Factor (en lineal) que compensa el gris de la textura al te�irla con el color del cat�logo. */
export const albedoGain: Record<SurfaceId, number> = gains as Record<SurfaceId, number>;
