# Visualizador 3D

Casa ranch modelada por código con React Three Fiber. Decisiones: `docs/DECISIONES.md` (T10–T24) y
`docs/COMPARATIVAS.md`. Licencias de los recursos: `assets/LICENCIAS.md`.

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `../roof-visualizer.tsx` | Componente público: controles HTML, anuncio, botones de vista, aviso sin WebGL y carga `React.lazy` de la escena. |
| `scene-canvas.tsx` | `Canvas` (frameloop bajo demanda), HDRI, sol, `CameraControls`, posprocesado (N8AO + AgX + MSAA ×4). Es el chunk aparte. |
| `roof-geometry.ts` | Funciones **puras** del techo: `hipInset` 0 → dos aguas, 1 → cuatro aguas; UV en metros; caballete, nervios del metal y hastial. Con pruebas unitarias. |
| `roof-rig.tsx` | Techo animado: deformación de forma (0,9 s), barrido de material (1,1 s) y fundido de color (0,4 s); interrumpibles. |
| `roof-materials.ts` | Materiales del techo y shader del barrido (`onBeforeCompile`); ondulación del metal generada por código. |
| `textures.ts` | Carga/liberación de texturas WebP, tamaño real del mosaico (`TILE_SIZE`) y precarga en reposo. |
| `house.tsx`, `eave-details.tsx` | Muros, ventanas, puerta, garaje, porche, entrada, césped; imposta, canalones y bajantes. |
| `assets.ts` | Importa HDRI y texturas con `?url` (Vite/Astro los empaquetan). |

Unidades: metros. Ejes: x = largo (cumbrera), y = altura, z = fondo (fachada en +z).

## Añadir un material

1. Texturas en `assets/textures/<id>-color.webp` (gris, se tiñe), `-normal.webp` (OpenGL) y `-orm.webp`
   (R = AO, G = rugosidad, B = metal). Añade el factor de compensación en `albedo-gain.json`.
2. Importa los tres archivos en `assets.ts` (`surfaceUrls`) y añade el id a `SurfaceId`.
3. Define su tamaño de mosaico (ancho × alto en metros) en `TILE_SIZE` de `textures.ts`.
4. Añade el material y sus colores en `packages/shared/src/visualizer/materials.ts` (`RoofMaterialId`).
5. Anota origen y licencia en `assets/LICENCIAS.md`.

El metal de junta alzada no usa textura: `roof-geometry.ts` (`buildRibsData`) y `roof-materials.ts`.

## Tamaños de mosaico (m)

| Superficie | Ancho × alto |
| --- | --- |
| three-tab-shingle | 3,07 × 2,03 |
| architectural-shingle | 3,0 × 2,29 |
| clay-tile | 2,9 × 2,9 |
| slate | 2,0 × 2,0 |
| cedar-shake | 1,4 × 1,4 |
| siding (horizontal) | 2,4 × 1,2 |
| grass | 1,4 × 1,4 |
| concrete | 2,5 × 2,5 |
