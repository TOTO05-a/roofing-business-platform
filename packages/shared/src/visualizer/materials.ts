/**
 * Materiales y colores del visualizador de techos (Etapa 1B).
 *
 * Son datos de ejemplo con nombres genéricos (sin marcas). En la Etapa 5 se
 * sustituyen por el catálogo real: `MaterialOption.visualizer_key` será el `id`
 * de un material de esta lista y `hex` el color de cada opción.
 */

export const roofShapes = ['gable', 'hip'] as const;
/** Forma del techo: dos aguas (`gable`) o cuatro aguas (`hip`). */
export type RoofShape = (typeof roofShapes)[number];

/** Clave del material del visualizador 3D (define su textura o su geometría). */
export type RoofMaterialId =
  | 'architectural-shingle'
  | 'three-tab-shingle'
  | 'standing-seam-metal'
  | 'clay-tile'
  | 'slate'
  | 'cedar-shake';

export interface LocalizedText {
  es: string;
  en: string;
}

export interface RoofColor {
  /** Identificador estable dentro del material. */
  id: string;
  /** Color base en hexadecimal `#rrggbb`. */
  hex: string;
  name: LocalizedText;
}

export interface RoofMaterial {
  /** Equivale a `visualizer_key` del catálogo real. */
  id: RoofMaterialId;
  name: LocalizedText;
  colors: readonly RoofColor[];
}

const c = (id: string, hex: string, es: string, en: string): RoofColor => ({
  id,
  hex,
  name: { es, en },
});

export const roofMaterials: readonly RoofMaterial[] = [
  {
    id: 'architectural-shingle',
    name: { es: 'Teja asfáltica arquitectónica', en: 'Architectural asphalt shingle' },
    colors: [
      c('charcoal', '#2f3033', 'Carbón', 'Charcoal'),
      c('pewter', '#6d7073', 'Gris peltre', 'Pewter gray'),
      c('weathered-wood', '#7d6e5f', 'Madera envejecida', 'Weathered wood'),
      c('bark', '#4f3b2c', 'Café corteza', 'Bark brown'),
      c('slate-blue', '#4a5a6a', 'Pizarra azulada', 'Slate blue'),
      c('desert', '#a58a68', 'Desierto', 'Desert'),
    ],
  },
  {
    id: 'three-tab-shingle',
    name: { es: 'Teja asfáltica de 3 lengüetas', en: '3-tab asphalt shingle' },
    colors: [
      c('black', '#26272a', 'Negro', 'Black'),
      c('gray', '#77797c', 'Gris', 'Gray'),
      c('brown', '#5b4332', 'Café', 'Brown'),
    ],
  },
  {
    id: 'standing-seam-metal',
    name: { es: 'Metal de junta alzada', en: 'Standing seam metal' },
    colors: [
      c('matte-charcoal', '#3a3d40', 'Carbón mate', 'Matte charcoal'),
      c('galvanized', '#a7adb2', 'Gris galvanizado', 'Galvanized gray'),
      c('bronze', '#6e5339', 'Bronce', 'Bronze'),
      c('colonial-red', '#8e2f2a', 'Rojo colonial', 'Colonial red'),
      c('forest-green', '#2f5a43', 'Verde bosque', 'Forest green'),
      c('reflective-white', '#eceeef', 'Blanco reflectante', 'Reflective white'),
    ],
  },
  {
    id: 'clay-tile',
    name: { es: 'Teja de barro o concreto', en: 'Clay or concrete tile' },
    colors: [
      c('terracotta', '#b5562f', 'Terracota', 'Terracotta'),
      c('sand', '#c9a77a', 'Arena', 'Sand'),
      c('tuscan-blend', '#9c5b3c', 'Mezcla toscana', 'Tuscan blend'),
    ],
  },
  {
    id: 'slate',
    name: { es: 'Pizarra', en: 'Slate' },
    colors: [
      c('slate-gray', '#5d6670', 'Gris pizarra', 'Slate gray'),
      c('black', '#2a2d31', 'Negro', 'Black'),
      c('gray-purple', '#675f73', 'Morado gris', 'Gray purple'),
    ],
  },
  {
    id: 'cedar-shake',
    name: { es: 'Tejuela de cedro', en: 'Cedar shake' },
    colors: [
      c('natural', '#a8794a', 'Natural', 'Natural'),
      c('weathered', '#8a8680', 'Envejecido', 'Weathered'),
    ],
  },
] as const;

export function getRoofMaterial(id: RoofMaterialId): RoofMaterial {
  const found = roofMaterials.find((m) => m.id === id);
  if (!found) throw new Error(`Material de techo desconocido: ${id}`);
  return found;
}
