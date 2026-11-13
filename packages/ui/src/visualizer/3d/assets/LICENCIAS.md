# Recursos del visualizador 3D: fuentes y licencias

Todos los recursos son **CC0** (dominio público): se pueden usar, modificar y redistribuir sin
atribución obligatoria, también en este repositorio público. Se anotan igualmente por trazabilidad.
Decisiones: `docs/COMPARATIVAS.md` C35, C39–C46 y C51 (D8).

| Archivo(s) en el repo | Origen | Ficha | Licencia |
| --- | --- | --- | --- |
| `kloofendal_48d_partly_cloudy_puresky_2k.hdr` | Poly Haven · Greg Zaal, Jarod Guest | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | CC0 |
| `textures/three-tab-shingle-*` | TextureCan · Rooftop 0010 | https://www.texturecan.com/details/560/ | CC0 |
| `textures/architectural-shingle-*` | Patrón propio generado por `packages/ui/scripts/roof-textures/build.py` sobre el granulado de TextureCan Rooftop 0010 | https://www.texturecan.com/details/560/ | CC0 |
| `textures/clay-tile-*` | ambientCG · Roofing Tiles 014 A | https://ambientcg.com/view?id=RoofingTiles014A | CC0 |
| `textures/slate-*` | Poly Haven · roof_slates_03 | https://polyhaven.com/a/roof_slates_03 | CC0 |
| `textures/cedar-shake-*` | ambientCG · Wood Siding 011 | https://ambientcg.com/view?id=WoodSiding011 | CC0 |
| `textures/siding-*` | ambientCG · Wood Siding 009 | https://ambientcg.com/view?id=WoodSiding009 | CC0 |
| `textures/grass-*` | ambientCG · Grass 004 | https://ambientcg.com/view?id=Grass004 | CC0 |
| `textures/concrete-*` | ambientCG · Concrete 048 | https://ambientcg.com/view?id=Concrete048 | CC0 |

El metal de junta alzada no usa textura: geometría y material por código (C41).

## Cómo se generan los mapas

`python -I packages/ui/scripts/roof-textures/build.py <carpeta-de-descargas>` convierte los
originales en tres WebP (2K en techo y fachada; 1K en césped y hormigón) por superficie: `-color` (en gris para teñir con el color del catálogo;
en color real para césped y hormigón), `-normal` (OpenGL) y `-orm` (R = oclusión, G = rugosidad,
B = metal). `textures/albedo-gain.json` guarda el factor que compensa el gris al teñir.
