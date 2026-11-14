# Video de demostración de la portada

La portada cinematográfica (D11) usa **tres tomas de dron de la misma casa y del mismo autor**, de Pexels. Son clips de stock de demostración: la casa no es de un cliente ni del Sur de Florida (está en Tennessee). Se sustituyen por video propio de la empresa cuando exista.

**Licencia:** [Licencia Pexels](https://www.pexels.com/license/): uso gratuito, también comercial, sin obligación de atribución (se da el crédito igualmente). No se puede vender el video tal cual ni sugerir que el autor respalda a la empresa.

| Clip | Autor | URL | Uso en la escena | Duración original |
| --- | --- | --- | --- | --- |
| `17170552` | [Jaxon Matthew Willis](https://www.pexels.com/@jaxon-matthew-willis-55957128/) | <https://www.pexels.com/video/drone-house-in-the-suburbs-17170552/> | Acercamiento desde la calle a la fachada | 52 s |
| `17170560` | Jaxon Matthew Willis | <https://www.pexels.com/video/drone-house-in-the-suburbs-17170560/> | La cámara sube desde la fachada hasta el techo | 39 s |
| `17170558` | Jaxon Matthew Willis | <https://www.pexels.com/video/drone-house-in-the-suburbs-17170558/> | Órbita cenital sobre el techo y el entorno | 43 s |

Originales: 1920×1080, 30 fps, unos 94 MB en total; **no están en el repositorio**. Se bajaron del CDN de Pexels (`videos.pexels.com/video-files/<id>/<id>-hd_1920_1080_30fps.mp4`).

## Cómo se generó la secuencia (T32)

1. Se aceleró cada toma (8×, 6× y 8×) y se unieron con fundidos de 1 s, a 10 fotogramas por segundo: **158 fotogramas**.
2. Escritorio: `apps/web/public/cine/d/f001.webp … f158.webp`, 1440 px de ancho, WebP calidad 62 (≈25 MB en total).
3. Móvil: `apps/web/public/cine/m/…`, recorte vertical centrado (4:5), 560 px de ancho, WebP calidad 58 (≈8 MB).

El navegador solo descarga la serie que le corresponde (retrato → móvil) y de forma progresiva: primero fotogramas espaciados y luego los intermedios; entre fotogramas contiguos se mezcla en el canvas para que el avance sea fluido.

Comando de referencia (ffmpeg):

```bash
ffmpeg -i 17170552.mp4 -i 17170560.mp4 -i 17170558.mp4 -filter_complex \
"[0:v]trim=0:48,setpts=(PTS-STARTPTS)/8,fps=10,format=yuv420p[a];\
[1:v]trim=0:39,setpts=(PTS-STARTPTS)/6,fps=10,format=yuv420p[b];\
[2:v]trim=0:42,setpts=(PTS-STARTPTS)/8,fps=10,format=yuv420p[c];\
[a][b]xfade=transition=fade:duration=1:offset=5[ab];\
[ab][c]xfade=transition=fade:duration=1:offset=10.5[o];[o]split[x][y];\
[x]scale=1440:-2[d];[y]crop=ih*0.8:ih:iw*0.28:0,scale=560:-2[m]" \
-map "[d]" -c:v libwebp -quality 62 d/f%03d.webp -map "[m]" -c:v libwebp -quality 58 m/f%03d.webp
```
