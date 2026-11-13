# Comparativas de decisiones

Para cada decisión importante: **qué opciones había, qué ventajas y desventajas tenía cada una y por qué se eligió la marcada con ✅**.
El resumen de todas las decisiones está en [`DECISIONES.md`](DECISIONES.md); aquí está el detalle de la elección.

Fuentes: investigación del 12-11-2026 con páginas oficiales de precios y documentación. Las cifras de costo son aproximadas y se revisan antes de contratar.

---

## Negocio y producto

### C1. ¿Una empresa o un producto para varias (SaaS)? → N1

| Opción                        | A favor                                                  | En contra                                                                          |
| ----------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| ✅ **Una sola empresa**       | Más simple, más rápida de construir y más barata de mantener | Para venderla a otras empresas habría que adaptarla después                      |
| Producto para varias empresas | Se podría vender a muchas empresas                       | Datos aislados por empresa, planes, facturación y marcas: el trabajo se multiplica |

**Por qué:** la app es para una empresa concreta; el modelo de datos permite añadir multiempresa más adelante con una migración.

### C2. ¿Cómo cobrar? → N5

| Opción                                    | A favor                                                       | En contra                                           |
| ----------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| ✅ **Pago en línea con Stripe (tarjeta y ACH)** | El cliente paga desde su portal; sin cuota mensual; ACH cuesta 0,8 % con tope de 5 USD | Comisión por transacción (tarjeta 2,9 % + 0,30 USD) |
| Solo registrar pagos (cheque, Zelle)      | Sin costo externo                                             | El cliente no puede pagar en la app; más trabajo manual |
| Registrar ahora y añadir Stripe después   | Sin costo al inicio                                           | Retrasa una función clave                           |

**Por qué:** pago cómodo para el cliente y sin costo fijo. Se desarrolla siempre en modo de prueba.

### C3. ¿Cómo se arman los presupuestos? → N6

| Opción                                        | A favor                                                                     | En contra                                    |
| --------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------- |
| ✅ **Catálogo + paquetes Básico/Mejor/Premium** | Presupuesto en minutos, sin errores; ofrecer tres opciones suele aumentar el valor de la venta | Hay que cargar el catálogo una vez |
| Partidas escritas a mano                      | Total flexibilidad                                                          | Lento y propenso a errores                   |

### C4. ¿Firma electrónica propia o un servicio? → N7

| Opción                                     | A favor                                                    | En contra                                                     |
| ------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------- |
| ✅ **Firma propia (ESIGN/UETA)**           | Sin costo; integrada en el portal                          | Requiere guardar bien la evidencia y una revisión legal       |
| DocuSeal (autoalojado)                     | Gratis en su versión comunitaria; producto probado         | Necesita un servidor propio aparte                            |
| Dropbox Sign / Documenso                   | Servicio legal ya resuelto                                 | De pago o con límite bajo de documentos gratis                |

**Por qué:** cumple el costo cero. La app guarda consentimiento, IP, dispositivo y huella del PDF; se revisará con un abogado antes de usarla con clientes reales.

### C5. ¿El descuento antes o después del impuesto? → P11

| Opción                       | A favor                                                         | En contra                                               |
| ---------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| ✅ **Antes del impuesto**    | Es lo habitual cuando el descuento lo da el vendedor; el cliente paga impuesto sobre el precio real | —                                                       |
| Después del impuesto         | Cálculo aparentemente más simple                                | El cliente pagaría impuesto sobre un importe que no paga |

**Por qué:** práctica habitual; se confirmará con el contador según el estado.

---

## Tecnología

### C6. Base de datos → T3

| Opción            | A favor                                                                          | En contra                                                       |
| ----------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| ✅ **PostgreSQL** | Datos muy relacionados (cliente → presupuesto → factura → pago); dinero exacto; casi todos los planes gratuitos gestionados son PostgreSQL; fácil de mudar a un servidor propio | — |
| MySQL             | Muy extendida                                                                     | Menos opciones gratuitas gestionadas; menos funciones avanzadas (RLS) |
| MongoDB           | Flexible para datos sin estructura fija                                          | Encaja mal con datos tan relacionados y con transacciones de dinero |

### C7. ORM (la capa que habla con la base de datos) → T3

| Opción        | A favor                                                      | En contra                                     |
| ------------- | ------------------------------------------------------------ | --------------------------------------------- |
| ✅ **Prisma** | Migraciones maduras, visor de datos (Prisma Studio), buena experiencia de desarrollo | Algo más pesado                       |
| Drizzle       | Ligero y cercano al SQL                                      | Herramientas de migración menos pulidas       |

### C8. Frontend → T2

| Opción                                       | A favor                                                                          | En contra                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| ✅ **Astro (sitio público) + React/Vite (plataforma)** | El sitio público casi no envía JavaScript: mejor SEO y velocidad; la plataforma es una app rápida tras el login | Dos herramientas de frontend               |
| Next.js para todo                            | Una sola herramienta                                                             | Añade un segundo servidor Node junto a Express sin beneficio claro |
| Solo React (SPA) para todo                   | Lo más simple                                                                    | Peor SEO para el sitio público                         |

### C9. Un repositorio o varios → T1

| Opción                     | A favor                                                                       | En contra                                       |
| -------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| ✅ **Monorepo (uno solo)** | Frontend y backend comparten validaciones, textos y cálculos sin desincronizarse; un solo PR por cambio | Un poco más de configuración inicial |
| Repos separados            | Cada parte independiente                                                      | Código duplicado o paquetes publicados aparte   |

### C10. Autenticación → T4

| Opción                                    | A favor                                                                       | En contra                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| ✅ **Better Auth + sesiones en cookie**   | Integración oficial con Express; roles, 2FA y recuperación incluidos; las sesiones se pueden revocar al instante | Librería más joven |
| Passport                                  | Muy conocida                                                                  | Todo lo demás (2FA, invitaciones…) se programa a mano |
| JWT en lugar de sesiones                  | Útil para apps móviles nativas                                                | No se puede revocar al instante; más riesgo en navegador |

### C11. Visualizador de techos: ¿componente React o Web Component? → D4

| Opción                       | A favor                                                                            | En contra                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| ✅ **Componente React**      | Se reutiliza en presupuestos y portal (ya en React); usa el sistema de animación y los componentes existentes; desarrollo más rápido | ≈ 60 kB extra en la página pública, cargados solo cuando el visualizador aparece |
| Web Component sin framework  | Muy ligero (≈ 10–15 kB)                                                            | Más trabajo; animación, accesibilidad e integración a mano |

### C12. Visualizador: ¿2D o 3D? → D4

| Opción                    | A favor                                          | En contra                                          |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| ✅ **2D vectorial (SVG)** | Ligero, fluido en celulares, nítido a cualquier tamaño | No se puede girar la casa                     |
| 3D (Three.js)             | Muy vistoso                                      | Más pesado y exigente para el celular              |

**Formas incluidas:** dos aguas y cuatro aguas (las más comunes en EE. UU.); techo plano y combinados, más adelante.

---

## Infraestructura

### C13. Alojamiento del sitio y la plataforma → I2

| Opción                   | A favor                                                       | En contra                                        |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------ |
| ✅ **Cloudflare Pages**  | Gratis, sin tarjeta, estáticos ilimitados, dominio propio después | Uso comercial no explícito en sus términos (no lo prohíbe) |
| Vercel (Hobby)           | Muy cómodo                                                    | **Prohíbe el uso comercial** en el plan gratuito |
| Netlify                  | Plan gratuito                                                 | Límite por créditos; términos comerciales no aclarados |

### C14. Alojamiento de la API → I2, I5

| Opción              | A favor                                             | En contra                                                       |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| ✅ **Render (Free)** | Sin tarjeta; Docker                                | Se duerme a los 15 min (≈ 1 min en despertar); no apto para producción |
| Google Cloud Run    | Rápido y apto para producción                       | **Exige tarjeta**                                               |
| Fly.io / Railway    | Buenos servicios                                    | Sin plan gratuito permanente                                    |
| VPS + Dokploy       | Control total, ≈ 5–15 USD/mes                        | Tiene costo y mantenimiento                                     |

**Por qué:** cumple el costo cero; antes de atender clientes reales se pasa a un plan de pago o a un servidor propio.

### C15. Base de datos gestionada → I2

| Opción          | A favor                                         | En contra                                         |
| --------------- | ----------------------------------------------- | ------------------------------------------------- |
| ✅ **Neon**     | Gratis permanente, sin tarjeta, despierta en segundos | Casi sin copias de seguridad (se hacen aparte) |
| Supabase        | Muchas funciones                                | Se pausa tras una semana sin uso; sin copias en el plan gratuito |
| Render Postgres | Junto a la API                                  | **Se borra a los 30 días** en el plan gratuito   |

### C16. Almacenamiento de fotos → I2, I7

| Opción              | A favor                                      | En contra                                   |
| ------------------- | -------------------------------------------- | ------------------------------------------- |
| ✅ **Cloudflare R2** | 10 GB gratis y sin costo de descarga        | Por confirmar si pide tarjeta al activarlo  |
| Backblaze B2        | 10 GB gratis                                 | Descarga gratis solo hasta cierto límite    |
| Supabase Storage    | Integrado con Supabase                       | Solo 1 GB                                   |

### C17. Correo transaccional → I2, I6

| Opción          | A favor                                     | En contra                                              |
| --------------- | ------------------------------------------- | ------------------------------------------------------ |
| ✅ **Resend**   | 3.000 correos/mes gratis; buena integración | Sin dominio propio solo envía al dueño de la cuenta    |
| Brevo           | Más correos diarios gratis                  | Añade su logo en el plan gratuito                      |
| Postmark        | Muy fiable                                  | Solo 100 correos/mes gratis                            |
| Amazon SES      | Muy barato                                  | Sin plan gratuito permanente                           |

---

## Forma de trabajo

### C18. Repositorio público o privado → W1

| Opción         | A favor                                                    | En contra                                     |
| -------------- | ---------------------------------------------------------- | --------------------------------------------- |
| ✅ **Público** | CI sin límite de minutos; protección de ramas gratis       | Cualquiera ve el código (nunca se suben secretos) |
| Privado        | Código oculto                                              | Minutos de CI limitados en el plan gratuito   |

### C19. Carpeta del proyecto → W4

| Opción                              | A favor                                   | En contra                                                    |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| ✅ **Fuera de OneDrive** (`C:\Users\ac138\dev\`) | Sin bloqueos ni sincronización de miles de archivos | La copia de seguridad es GitHub, no OneDrive |
| Escritorio (dentro de OneDrive)     | A mano                                    | OneDrive bloquea archivos y sincroniza `node_modules`        |

### C20. Agente para implementar → W6

| Opción                            | A favor                                       | En contra                                                 |
| --------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| ✅ **general-purpose (Sonnet)**   | Funciona en este monorepo; usa las skills necesarias | No es especialista                                 |
| fullstack-web-engineer            | Especialista en web                           | Su skill de shadcn falla en la raíz de un monorepo y no arranca |

---

## Etapa 1B · Visualizador de techos (aprobadas el 12-11-2026)

### C21. Aspecto del visualizador: ¿dibujo, fotos o mezcla? → D4

| Opción                                                   | A favor                                                                           | En contra                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| SVG plano                                                | Ligero, cambio instantáneo de color                                               | Se ve «dibujado»                                                       |
| SVG con luz y sombras                                    | Semirrealista, cambio instantáneo                                                 | Sigue sin parecer un techo real                                        |
| ✅ **Casa vectorial + texturas fotográficas reales (CC0)** | El techo parece real; el cambio de material sigue siendo instantáneo; sin costo ni problemas de derechos | ≈ 100–300 kB por textura; hay que descargarlas (se pide permiso antes) |
| Foto de casa real con el techo recortado                 | Máximo realismo                                                                   | Necesita fotos propias de la empresa y una máscara por foto; el teñido puede verse artificial |

**Por qué:** realismo donde el cliente mira (el techo) sin perder fluidez. Las fotos de obras propias se podrán añadir después sin rehacer nada. Las texturas viven en el proyecto (fuera de OneDrive) y ocupan menos de 2 MB.

### C22. Materiales y colores: ¿de dónde salen?

| Opción                                           | A favor                                         | En contra                                     |
| ------------------------------------------------ | ----------------------------------------------- | --------------------------------------------- |
| ✅ **Archivo de datos genérico en `packages/shared`** | Permite avanzar ya; se sustituye por el catálogo real (Etapa 5) | Nombres genéricos, sin marcas         |
| Esperar al catálogo real                         | Datos definitivos                               | Frena la etapa                                |
| Marcas reales ahora                              | Más concreto                                    | No sabemos qué marcas instala la empresa: sería inventar |

### C23. Animación al cambiar de material

| Opción                                   | A favor                                     | En contra                        |
| ---------------------------------------- | ------------------------------------------- | -------------------------------- |
| ✅ **Motion: barrido de abajo arriba + fundido** | Fluido; ya instalado; instantáneo con «reducir movimiento» | —                    |
| Sin animación                            | Lo más simple                               | Menos atractivo; no cumple lo pedido |
| Otra librería                            | —                                           | Más peso sin necesidad           |

### C24. Alcance de la Etapa 1B

| Opción                                                        | A favor                              | En contra                       |
| ------------------------------------------------------------- | ------------------------------------ | ------------------------------- |
| ✅ **Visualizador + sección «Elige tu techo» + animación de entrada** | Etapa acotada y verificable    | La anatomía por capas espera    |
| Incluir anatomía por capas y comparador de paquetes           | Todo junto                           | Etapa grande; encajan mejor en las Etapas 3 y 5 |

### C25. Animación de entrada

| Opción                                                        | A favor                                       | En contra                      |
| ------------------------------------------------------------- | --------------------------------------------- | ------------------------------ |
| ✅ **Solo CSS, una vez por sesión, con «Saltar»**             | No retrasa la página; no molesta              | Efectos más sencillos          |
| Con React/Motion                                              | Efectos más ricos                             | Carga JavaScript antes de ver la página |
| En cada visita                                                | —                                             | Molesta                        |

### C26. Accesibilidad del visualizador

| Opción                                                              | A favor                                          | En contra             |
| ------------------------------------------------------------------- | ------------------------------------------------ | --------------------- |
| ✅ **Teclado + anuncio al lector de pantalla + nombre de cada color** | Cumple WCAG 2.2 AA; usable con daltonismo       | Algo más de trabajo   |
| Solo muestras de color                                              | Visualmente limpio                               | Excluye a personas con daltonismo o lector de pantalla |

### C27. Pruebas del visualizador

| Opción                                                     | A favor                                     | En contra                 |
| ---------------------------------------------------------- | ------------------------------------------- | ------------------------- |
| ✅ **Unitarias + e2e con axe + capturas en 3 tamaños**     | Detecta fallos y roturas futuras en la CI   | Más tiempo de CI          |
| Revisión a ojo                                             | Rápida                                      | No protege nada a futuro  |

### C28. Quién implementa la Etapa 1B

| Opción                                          | A favor                                   | En contra                                    |
| ----------------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| ✅ **general-purpose (Sonnet) + code-reviewer** | Funciona en el monorepo; costo moderado; revisión independiente | —                        |
| fullstack-web-engineer                          | Especialista                              | No arranca en este monorepo (skill shadcn)   |
| Opus                                            | Máxima capacidad                          | Más caro sin necesidad                       |

### C29. Peso del visualizador: ¿aligerar o mantener? (13-11-2026)

| Opción                                                        | A favor                                                                                | En contra                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| ✅ **Aligerar: radios nativos + animación CSS / Web Animations** | ≈ 80 kB en lugar de ≈ 126 kB (−37 %); los radios nativos funcionan mejor con tecnologías de asistencia | El visualizador no usa el mismo sistema de animación que la plataforma |
| Mantener Radix y Motion                                       | Ya hecho; mismo sistema que la plataforma                                              | Más peso en la página que ven todos los clientes             |

**Condición del cliente:** sin perder calidad visual. Si algún efecto no queda igual, esa parte se mantiene como estaba y se consulta.

### C30. Detalles del visualizador confirmados (13-11-2026)

| Decisión | Elegida ✅ | Alternativa | Por qué |
| --- | --- | --- | --- |
| Dependencias del sitio | `react` y `react-dom` en `apps/web` | Ninguna real | Obligatorias para `@astrojs/react` |
| Vista de la casa | Perspectiva oblicua (fachada + costado) | Fachada plana | Se aprecia la forma del techo y se ve más real |
| Colores de la casa | Paleta de marca + negro/blanco para luces y sombras | Solo paleta | Sombras más naturales |

### C31. Modelo y esfuerzo de los agentes (13-11-2026)

| Tarea | Antes | Elegida ✅ | Por qué |
| --- | --- | --- | --- |
| Búsquedas web y consultas | Sonnet bajo/medio | Haiku bajo | Tarea simple; mucho más barato |
| Correcciones mecánicas | Sonnet medio | Sonnet bajo | Instrucciones ya detalladas por la revisión |
| Implementación | Sonnet medio | Sonnet medio | Equilibrio entre calidad y costo |
| Revisión de código rutinaria | Opus alto | Sonnet medio | Detecta los mismos fallos habituales por mucho menos |
| Segunda revisión | Opus alto | Sonnet bajo o la sesión principal | Solo comprueba una lista |
| Seguridad, pagos, datos, autenticación | Opus alto | Opus alto | Un error aquí cuesta más que los tokens |

**Alternativa descartada:** usar siempre el modelo más capaz (más caro y agota antes el límite de uso) o siempre el más barato (riesgo en seguridad y pagos).

### C32. Visualizador 3D realista frente a texturas con IA (13-11-2026)

| Opción | A favor | En contra | Por qué |
| --- | --- | --- | --- |
| ✅ **Visualizador 3D realista** | Realismo muy alto; transiciones 3D posibles; sin costo | Más peso y trabajo | La prioridad es que se vea realista (W13) |
| Texturas generadas con IA sobre el 2D | Fotos muy vistosas | Tiene costo en créditos; la casa seguiría en 2D | Choca con I1/I8 y no da transiciones 3D |

### C33. Base del visualizador 3D (13-11-2026)

| Opción | A favor | En contra | Por qué |
| --- | --- | --- | --- |
| ✅ **React Three Fiber + drei** | Escena como componentes React; encaja con la isla de Astro y `/componentes`; drei trae HDRI, sombras, controles y carga de texturas; posprocesado disponible | ≈ +150 kB; R3F 9.8 admite React hasta 19.3 | Más rápido llegar a algo realista y más mantenible (W13) |
| Three.js directo | Mínima dependencia; control total | Montaje, cambio de tamaño, liberación de GPU, HDRI y controles a mano; más riesgo de fugas | Solo compensaría si el peso importara |

### C34. Casa 3D: ¿por código o modelo descargado? (13-11-2026)

| Opción | A favor | En contra | Por qué |
| --- | --- | --- | --- |
| ✅ **Modelada por código** | Techo paramétrico que se anima entre dos y cuatro aguas; UV exactas por faldón; sin licencias ajenas; reutilizable | Más trabajo inicial; el realismo depende del detalle y las texturas | El techo es lo que cambia; un GLB traería uno fijo |
| Modelo GLB descargado | Más detalle de partida | Casi no hay casas ranch CC0; Sketchfab suele ser CC-BY o de pago; techo fijo con UV inservibles; varios MB | No resuelve lo principal y arriesga la licencia |
| Mixto (código + adornos GLB CC0) | Escena más viva | Otra descarga que revisar | Puede decidirse después sin cambiar la base |

### C35. Iluminación del visualizador 3D (13-11-2026)

| Opción | A favor | En contra | Por qué |
| --- | --- | --- | --- |
| ✅ **HDRI CC0 en el repo + sol direccional** | Luz y reflejos reales (metal, pizarra); sombras nítidas bajo aleros; puede servir de cielo | Archivo de 1,5–6 MB | Máximo realismo con poco código (W13) |
| Cielo procedural (`Sky` + `Lightformer`) | Sin descargas ni licencias | Reflejos planos, aspecto de estudio | Pierde realismo |
| `Environment preset` de drei | Una línea | Descarga desde un CDN externo en cada visita; licencia fuera del repo | Dependencia de terceros |

### C36. Texturas de teja asfáltica (13-11-2026)

| Material | Opción | A favor | En contra |
| --- | --- | --- | --- |
| 3 lengüetas | ✅ **TextureCan `rooftop_0010` (CC0)** | Foto PBR real con forma idéntica | ZIP de 55 MB; se guardan solo los mapas necesarios recomprimidos |
| 3 lengüetas | Por código | Sin descargas | Menos realista |
| Arquitectónica | ✅ **Patrón laminado por script + granulado de `rooftop_0010`** | Forma correcta y granulado real; todo CC0 | Más trabajo |
| Arquitectónica | TextureCan `rooftop_0011` | Lista para usar | Parece un techo decorativo, no arquitectónico |
| Arquitectónica | `rooftop_0010` con otro tinte | Lo más simple | Igual que la de 3 lengüetas |

Fuentes revisadas: Poly Haven y ambientCG (sin teja asfáltica), TextureCan y 3dtextures.me (CC0).

### C37. Metal de junta alzada (13-11-2026)

| Opción | A favor | En contra | Por qué |
| --- | --- | --- | --- |
| ✅ **Geometría + material por código** | Nervios con sombra y brillo reales; refleja el HDRI; colores fieles; sin descargas | Más trabajo de geometría (cortes a cuatro aguas) | Lo más realista para este material |
| Lo mismo + ambientCG `Metal027` | Grano fino de pintura | 6,3–24,9 MB; casi invisible a esa distancia | Mejora mínima |
| Chapa ondulada o grecada CC0 | Foto ya hecha | Es otro producto (industrial) | Confundiría al cliente |

### C38. Textura de teja de barro o concreto (13-11-2026)

| Opción | A favor | En contra |
| --- | --- | --- |
| ✅ **ambientCG `RoofingTiles014A` (CC0)** | Teja en «S» limpia, típica de EE. UU.; trae relieve | Muy uniforme: se añade variación por pieza |
| ambientCG `RoofingTiles011A` | Limpia | Perfil más europeo |
| Poly Haven `clay_roof_tiles_02` | Escaneo muy realista | Vieja y sucia; no vende un techo nuevo |
| Poly Haven `roof_tiles` | Realista | Envejecida y apagada |
| TextureCan `rooftop_0008` | Limpia | Teja plana; ZIP de 49 MB |

### C39. Textura de pizarra (13-11-2026)

| Opción | A favor | En contra |
| --- | --- | --- |
| ✅ **Poly Haven `roof_slates_03` (CC0)** | Escaneo real, limpio y uniforme; variación natural | Tono claro: se pasa a gris y se tiñe |
| Poly Haven `roof_slates_02` | Escaneo real | Vieja y desigual |
| ambientCG `RoofingTiles003` | Limpia | Verdosa, aspecto de render; 25 MB |

### C40. Textura de tejuela de cedro (13-11-2026)

| Opción | A favor | En contra |
| --- | --- | --- |
| ✅ **ambientCG `WoodSiding011` (CC0)** | La más limpia; veta real, bordes gruesos | Tono gris: el tinte debe calentarlo para «natural» |
| ambientCG `WoodSiding010` / `013` | Igual de realistas | Manchas de musgo |
| ambientCG `WoodSiding012` | Realista | Oscura y sucia |
| 3dtextures.me `Wood Roof Shingles 002` | Cálida | Piezas pequeñas; descarga desde Google Drive |
| 3dtextures.me `Wood Shingles 001` | — | Estilizada |

### C41. Paredes de la casa 3D (13-11-2026)

| Opción | A favor | En contra |
| --- | --- | --- |
| ✅ **ambientCG `WoodSiding009` en blanco roto** | Revestimiento horizontal típico de EE. UU.; neutro | Suciedad leve en juntas (aporta realismo) |
| Revestimiento por código | Sin descargas | Aspecto de render |
| Ladrillo (`Bricks051`, `exterior_wall_cladding_02`) | Ranch de ladrillo es común | Compite con el color del techo; 27 MB |

### C42. Suelo de la escena 3D (13-11-2026)

| Elemento | Opción | A favor | En contra |
| --- | --- | --- | --- |
| Césped | ✅ **ambientCG `Grass004`** | Escaneo real, variado | 39,9 MB (2K) |
| Césped | `Grass005` / `Grass008` | Uniformes | Aspecto artificial |
| Entrada | ✅ **ambientCG `Concrete048`** | Acabado de escoba típico de EE. UU. | 29 MB (2K) |
| Entrada | `Concrete034` | 10,6 MB | Parece yeso |
| Entrada | `Concrete047A` | — | Sucio |

### C43. Controles de cámara (13-11-2026)

| Opción | A favor | En contra | Por qué |
| --- | --- | --- | --- |
| ✅ **Giro limitado + botones de vista** | Interactivo; alternativa de un clic (WCAG 2.5.7); sin zoom con rueda; no atrapa el dedo en móvil | Más trabajo | Atractivo y accesible |
| Solo vistas fijas | Simple y accesible | Pierde la sensación 3D | Menos impresionante |
| `OrbitControls` libre | Libertad total | Trasera vacía, atraviesa el suelo, secuestra la página | Accesibilidad y experiencia |
| Giro automático | Llamativo | Molesta; hay que pausarlo (WCAG 2.2.2) | No aporta |

### C44. Transiciones 3D (13-11-2026)

| Opción | A favor | En contra |
| --- | --- | --- |
| ✅ **Deformación + barrido de reinstalación + fundido de color** | Muy «3D»; cuenta la historia de un techo nuevo; fluido en GPU | Shader propio y cálculo cuidadoso |
| Tejas que caen una a una | Llamativo | Miles de piezas modeladas; abandona las texturas aprobadas; menos fluido |
| Fundido cruzado | Simple | Plano, como en 2D |

### C45. ¿Qué hacer con el visualizador 2D? (13-11-2026)

| Opción | A favor | En contra | Por qué |
| --- | --- | --- | --- |
| Mantenerlo como respaldo (carga y sin WebGL) | Sin huecos vacíos; pruebas actuales siguen | Dos dibujos que mantener | Recomendado, pero no elegido |
| ✅ **Eliminarlo** | Menos código; una sola representación | Hay que resolver la carga y la falta de WebGL de otra forma; rehacer pruebas | Decisión del cliente |
| Selector 2D / 3D | El usuario elige | Más interfaz; el 2D parece la versión pobre | Complica |

### C46. Carga del 3D y equipos sin WebGL (13-11-2026)

| Opción | A favor | En contra | Por qué |
| --- | --- | --- | --- |
| Captura estática + barra de progreso | Primera impresión realista; nunca vacío | Una imagen que regenerar si cambia la escena | Recomendada, no elegida |
| ✅ **Solo indicador de carga** | Lo más simple; nada que mantener | 1–3 s de recuadro gris | Decisión del cliente |
| Carga por fases (512 px → 2K) | Aparece antes | Doble de texturas; salto de nitidez | Complejo |

### C47. Formato de las texturas en el repo (13-11-2026)

| Opción | A favor | En contra |
| --- | --- | --- |
| ✅ **WebP 2K, 3 mapas (color, normal, ORM) + carga por material** | ≈ 15–20 MB en total; calidad casi idéntica; sin herramientas nuevas | Sin compresión de GPU (compensado cargando solo lo necesario) |
| KTX2 / Basis Universal | 4–8× menos memoria gráfica | Descargar un ejecutable codificador; decodificador WASM; artefactos en normales |
| JPG/PNG originales | Sin conversión | 40–60 MB en el repo; más mapas y memoria |

### C48. Posprocesado del 3D (13-11-2026)

| Opción | A favor | En contra |
| --- | --- | --- |
| ✅ **N8AO + AgX + MSAA ×4** | Sombras de contacto, blancos sin quemar, bordes limpios: aspecto de foto | ≈ +100 kB y algo más de GPU (calidad media en celulares) |
| Sin posprocesado | Simple y ligero | Esquinas y aleros planos |
| + bloom, viñeta y profundidad de campo | Vistoso | Parece anuncio o videojuego; oculta texturas |
