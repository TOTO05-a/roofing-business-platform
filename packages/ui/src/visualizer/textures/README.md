# Texturas fotográficas del visualizador de techos

Cada material del visualizador tiene un **patrón SVG procedural** de respaldo
(`../roof-paint.tsx`). Una foto es opcional y, si existe, lo sustituye.

## Cómo registrar una textura

1. Consigue una foto **CC0** (dominio público) del material, sin marcas ni sombras marcadas.
2. Conviértela a **escala de grises, luminosidad media-alta** (la tinta del color la
   multiplica, así que una foto oscura daría un techo casi negro). Mosaico repetible
   (_seamless_), unos 512 × 512 px, WebP o AVIF, idealmente < 60 KB.
3. Guarda el archivo aquí con el nombre del material, por ejemplo `cedar-shake.webp`.
   Ids válidos: `architectural-shingle`, `three-tab-shingle`, `standing-seam-metal`,
   `clay-tile`, `slate`, `cedar-shake`.
4. Regístralo en `index.ts`:

   ```ts
   import cedarShake from './cedar-shake.webp';
   export const textureRegistry = { 'cedar-shake': cedarShake };
   ```

   Alternativa: poner una URL en el campo `textureUrl` del material en
   `packages/shared/src/visualizer/materials.ts` (tiene prioridad sobre el registro).
5. Anota la fuente y la licencia en `LICENCIAS.md` (misma carpeta).

## Cómo se pinta

Con foto, el techo usa un `<pattern>` con la imagen y, encima, un relleno del color
elegido con `mix-blend-mode: multiply`. Sin foto, se usa el patrón procedural del material.
La foto se coloca en una celda **cuadrada** (`TEXTURE_CELL` en `roof-paint.tsx`), así que una
textura cuadrada y repetible no se recorta ni muestra costuras. Si la imagen no carga, se vuelve
al patrón procedural.
