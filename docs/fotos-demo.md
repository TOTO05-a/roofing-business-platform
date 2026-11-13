# Fotos de demostración

Las fotos de la galería «Proyectos» de la portada son **fotos de stock de demostración**, no obras de la empresa. Se usan mientras no haya fotos reales (decisión D7; comparativa C33 en [`COMPARATIVAS.md`](COMPARATIVAS.md)). Todas son de Unsplash y se pueden usar gratis, también con fines comerciales, bajo la [Licencia Unsplash](https://unsplash.com/license).

Los originales están en `apps/web/src/assets/proyectos/` (JPEG de calidad alta, máximo 2000 px de ancho). El build de Astro genera las versiones AVIF y WebP.

| Archivo                         | Autor                                                | URL de la foto                                                                                           | Licencia  |
| ------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------- |
| `teja-barro-estuco.jpg`         | [ubeyonroad](https://unsplash.com/@ubeyonroad)       | <https://unsplash.com/photos/a-white-stucco-house-with-a-red-tile-roof-lx-FLZx3iQk>                      | Unsplash  |
| `teja-barro-detalle.jpg`        | [Kristin O Karlsen](https://unsplash.com/@kristinokarlsen) | <https://unsplash.com/photos/a-house-with-a-roof-made-of-clay-tiles-_TR3XfBFqIc>                   | Unsplash  |
| `techo-metal-casa-blanca.jpg`   | [Дмитрий Рощупкин](https://unsplash.com/@angrygrandmama) | <https://unsplash.com/photos/a-small-white-house-with-a-metal-roof-VMd0w7kQPdE>                     | Unsplash  |
| `casa-palmeras-miami.jpg`       | [Zoshua Colah](https://unsplash.com/@zoshuacolah)    | <https://unsplash.com/photos/a-house-with-a-fence-and-palm-trees-in-front-of-it-kN1D6NMonsk>             | Unsplash  |
| `teja-asfaltica-vista-aerea.jpg`| [Paragon Exterior](https://unsplash.com/@paragonexterior) (paragonexterior.com) | <https://unsplash.com/photos/aerial-view-of-a-suburban-house-with-a-grey-roof--uvuU43FAwQ> | Unsplash  |
| `casa-orlando.jpg`              | [Eric Ardito](https://unsplash.com/@ericardito)      | <https://unsplash.com/photos/a-blue-and-white-house-with-red-shutters-luiRjaNEb1A>                       | Unsplash  |
| `techo-plano-casa-moderna.jpg`  | [Salvo Media LLC](https://unsplash.com/@salvomedia)  | <https://unsplash.com/photos/modern-white-house-with-large-windows-and-a-concrete-driveway-W7XqqixNnII>  | Unsplash  |
| `techo-plano-edificio.jpg`      | [CHUTTERSNAP](https://unsplash.com/@chuttersnap)     | <https://unsplash.com/photos/aerial-view-of-white-and-black-rooftop-BpnecXy_NlA>                         | Unsplash  |
| `cuadrilla-instalando-teja.jpg` | [Zohair Mirza](https://unsplash.com/@zamclicks)      | <https://unsplash.com/photos/person-carrying-shingles-on-roof-4XMHsy4Rvi8>                               | Unsplash  |

**Notas**

- Son fotos de stock de demostración: no muestran trabajos de la empresa ni las casas son de clientes. Algunas no son del Sur de Florida (la casa de estuco es de Los Angeles y la cuadrilla de Texas); se eligieron por el tipo de techo.
- La licencia no exige atribución; se da el crédito igualmente. Paragon Exterior pide enlazar a su sitio (paragonexterior.com) al usar su foto: queda indicado arriba.
- Al llegar las fotos reales, se sustituyen los archivos y los textos `web.projects.items` de `packages/shared/src/i18n/`, y se borra este documento.
