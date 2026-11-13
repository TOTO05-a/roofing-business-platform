import type { RoofMaterialId } from '@roofing/shared/visualizer';

/**
 * Registro de texturas fotográficas por material.
 *
 * Mientras un material no aparezca aquí (ni tenga `textureUrl` en los datos de
 * `@roofing/shared`), el visualizador dibuja su patrón SVG procedural.
 * Para registrar una foto, ver `README.md` en esta carpeta.
 *
 * Ejemplo (cuando exista el archivo):
 *   import cedarShake from './cedar-shake.webp';
 *   export const textureRegistry = { 'cedar-shake': cedarShake };
 */
export const textureRegistry: Partial<Record<RoofMaterialId, string>> = {};
