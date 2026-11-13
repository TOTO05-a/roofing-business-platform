# Registro de decisiones

Todas las decisiones importantes del proyecto, en un solo lugar y en lenguaje sencillo.
Cada fila dice **qué** se decidió, **por qué** y **cuándo**. Si una decisión cambia, se marca como _Reemplazada_ y se añade la nueva; no se borra.

- Documento original de la Etapa 1 (propuesta completa): [`planificacion/Roofing-Platform-Etapa1-Decisiones.docx`](planificacion/Roofing-Platform-Etapa1-Decisiones.docx)
- Modelo de datos detallado: [`arquitectura/modelo-datos.md`](arquitectura/modelo-datos.md)
- **Comparativas** (por qué se eligió cada opción frente a las demás): [`COMPARATIVAS.md`](COMPARATIVAS.md)

**Estados:** ✅ Aprobada · ⏳ Pendiente de dato o verificación · 🔁 Reemplazada

---

## 1. Negocio y producto

| #   | Decisión                                                                                                                      | Por qué                                                                   | Fecha      | Estado |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------- | ------ |
| N1  | La app es para **una sola empresa** de roofing (no es un producto para varias empresas).                                      | Más simple, más rápido y más barato de construir y mantener.              | 12-11-2026 | ✅     |
| N2  | Mercado: **EE. UU., viviendas (residencial)**. Unidades en squares y pies; moneda USD.                                        | Es donde opera la empresa.                                                | 12-11-2026 | ✅     |
| N3  | **Cuatro roles:** cliente, empleado, administrador y superadministrador.                                                      | Clientes y empleados usan la app, pero cada uno ve solo lo que le toca.   | 12-11-2026 | ✅     |
| N4  | **Sin reclamos al seguro:** el cliente paga directamente.                                                                     | Así trabaja la empresa; el flujo es más simple.                           | 12-11-2026 | ✅     |
| N5  | **Pago en línea con Stripe** (tarjeta y transferencia ACH). Siempre en **modo de prueba** hasta que el dueño decida lo contrario. | Sin cuota mensual; ACH es mucho más barato para importes grandes.          | 12-11-2026 | ✅     |
| N6  | Presupuestos con **catálogo de precios y paquetes Básico / Mejor / Premium**.                                                 | Presupuestos rápidos, sin errores y con aspecto profesional.             | 12-11-2026 | ✅     |
| N7  | **Firma electrónica propia** y **aviso de cancelación de 3 días** (regla FTC).                                                | Obligación legal en ventas a domicilio; sin costo de servicios externos.  | 12-11-2026 | ✅ (revisión legal ⏳) |
| N8  | **Empezar de cero:** sin migrar datos; se usan datos de ejemplo para probar.                                                  | No hay datos previos que importar.                                        | 12-11-2026 | ✅     |
| N9  | **Español principal, inglés secundario** con selector de idioma.                                                              | Requisito del cliente.                                                    | 12-11-2026 | ✅     |
| N10 | Textos del sitio son **de ejemplo** hasta recibir los datos reales (estado, licencia, servicios, área, garantías).            | No inventar datos del negocio.                                            | 12-11-2026 | ⏳     |

## 2. Reglas de presupuestos y datos del negocio

Aprobadas junto con el modelo de datos.

| #   | Decisión                                                                                                                   | Por qué                                                         | Fecha      | Estado |
| --- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------- | ------ |
| P1  | El aviso de 3 días se entrega **siempre**, firme el cliente en persona o en línea. Sin renuncia por emergencia por ahora.   | Opción más segura legalmente.                                   | 12-11-2026 | ✅     |
| P2  | Estado de operación y número de licencia se configuran en los **ajustes de la empresa**.                                   | Falta el dato; no debe quedar fijo en el código.                | 12-11-2026 | ⏳     |
| P3  | Se permiten **varios paquetes por nivel** (p. ej. Básico en teja y Básico en metal).                                       | Distintos tipos de techo necesitan distintas opciones.          | 12-11-2026 | ✅     |
| P4  | **Una tasa de impuesto** configurable sobre materiales, con opción de aplicarla también a la mano de obra.                 | Cubre el caso común y deja margen para la regla de cada estado. | 12-11-2026 | ✅     |
| P5  | **Anticipo** en porcentaje configurable y editable en cada presupuesto. Solo anticipo y saldo (sin pagos por etapas).      | Simple para empezar; se puede ampliar después.                  | 12-11-2026 | ✅     |
| P6  | La cuadrilla solo ve lo operativo (medidas, fotos, checklist, etapas). Ventas ve los precios de **sus** presupuestos. Ningún empleado ve facturas ni pagos. | Privacidad y control de la información económica. | 12-11-2026 | ✅ |
| P7  | **Un firmante** por presupuesto.                                                                                           | Suficiente para la primera versión.                             | 12-11-2026 | ✅     |
| P8  | Fotos y documentos firmados se conservan **7 años** (configurable).                                                        | Propuesta habitual; validar con contador o abogado.             | 12-11-2026 | ⏳     |
| P9  | Reseñas: solo se envía el **enlace** (p. ej. Google); no se guardan calificaciones.                                        | Evita duplicar lo que ya hacen las plataformas de reseñas.      | 12-11-2026 | ✅     |
| P10 | Solo administración cambia el catálogo. Cada presupuesto tiene un **descuento** que solo aplica administración.            | Control de precios y márgenes.                                  | 12-11-2026 | ✅     |
| P11 | El **descuento se aplica antes del impuesto**, repartido entre material y mano de obra.                                    | Es lo habitual; el cliente paga impuesto sobre el precio real. Confirmar con el contador según el estado. | 12-11-2026 | ✅ |
| P12 | **Sin margen o recargo** en el cálculo: los precios del catálogo ya son precios de venta.                                  | Evita un parámetro que el modelo aprobado no contempla.         | 12-11-2026 | ✅     |
| P13 | Dinero siempre en **centavos enteros** y porcentajes en **puntos básicos** (1 % = 100). Al enviar un presupuesto, sus precios **quedan congelados**. | Sin errores de redondeo; un cambio de catálogo no altera lo enviado. | 12-11-2026 | ✅ |

## 3. Diseño y experiencia

| #   | Decisión                                                                                                                               | Por qué                                                       | Fecha      | Estado |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------- | ------ |
| D1  | Marca provisional **«Cresta Roofing»** (pizarra `#1E2A38` + cobre `#B45309`; tipografías Manrope y Source Sans 3; logo en SVG).        | La empresa no tenía identidad; se sustituye fácilmente.       | 12-11-2026 | ✅ (nombre por verificar ⏳) |
| D2  | **Accesibilidad WCAG 2.2 AA**, comprobada con pruebas automáticas (contraste, teclado, lectores de pantalla).                          | Cualquier persona debe poder usar la app; reduce riesgo legal. | 12-11-2026 | ✅     |
| D3  | **Animación de entrada** de 1–1,5 s en el sitio público: se puede saltar y respeta «reducir movimiento».                               | Petición del cliente, sin molestar.                           | 12-11-2026 | ✅     |
| D4  | **Visualizador de techos** en ilustración 2D (SVG), como **componente React** con materiales y colores reales del catálogo; formas **dos aguas y cuatro aguas**; casa en 3D queda para después. | Atractivo y ligero en celulares; reutilizable en presupuestos y portal. Ver C11 y C12. | 12-11-2026 | 🔁 (por D7) |
| D6  | **Transiciones 3D** en el visualizador como mejora futura; la capa de animación queda aislada para poder añadirlas. | Petición del cliente. | 13-11-2026 | 🔁 (por D7) |
| D7  | **Visualizador 3D realista** (React Three Fiber) que **sustituye por completo** al 2D: el 2D se elimina; se conservan los controles accesibles, los datos de materiales y los textos. Ver C32–C45. | Realismo prioritario (W13); decisión del cliente. | 13-11-2026 | ✅ |
| D5  | Modo claro por defecto y **modo oscuro** opcional; diseño probado en 390, 834 y 1512 px.                                               | Comodidad y uso en cualquier dispositivo.                     | 12-11-2026 | ✅     |

## 4. Tecnología y arquitectura

| #   | Decisión                                                                                                       | Por qué                                                                    | Fecha      | Estado |
| --- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- | ------ |
| T1  | **Un solo repositorio (monorepo)** con sitio, plataforma, API y código compartido.                             | Frontend y backend comparten validaciones, textos y cálculos sin desincronizarse. | 12-11-2026 | ✅ |
| T2  | Sitio público con **Astro**; plataforma con **React + Vite**; API con **Node.js + Express** (TypeScript estricto). | Astro da mejor SEO y velocidad; Express era requisito.                  | 12-11-2026 | ✅     |
| T3  | Base de datos **PostgreSQL** con **Prisma** (Neon en producción, PostgreSQL 18 en Docker en local).            | Datos muy relacionados y dinero exacto; fácil de mudar a un servidor propio. | 12-11-2026 | ✅  |
| T4  | Autenticación con **Better Auth**: sesiones en cookie segura, verificación en dos pasos para administradores, registro **solo por invitación**. | Seguro y estándar; nadie se registra sin invitación. | 12-11-2026 | ✅ |
| T5  | **Cada usuario solo ve lo suyo**, con doble protección: filtro en la API y reglas en la base de datos.         | Privacidad de clientes y empleados.                                        | 12-11-2026 | ✅     |
| T6  | La plataforma llama a la API **en el mismo dominio** (proxy), no entre dominios distintos.                     | Los navegadores bloquean cookies entre dominios.                          | 12-11-2026 | ✅     |
| T7  | Todo empaquetado con **Docker** y configuración por variables de entorno.                                     | Mudar a dominio propio o a un servidor propio sin reescribir.             | 12-11-2026 | ✅     |
| T8  | Pruebas: **Vitest** (unitarias), **Supertest** (API) y **Playwright + axe** (navegador y accesibilidad), ejecutadas en cada PR. | Nada se da por bueno sin ejecutarlo.                     | 12-11-2026 | ✅     |
| T9  | Node 26 y pnpm 12.                                                                                             | Versiones estables actuales.                                               | 12-11-2026 | ✅     |
| T10 | Visualizador 3D con **React Three Fiber + drei** (Three.js por debajo). Ver C33. | Escena como componentes React; HDRI, sombras, controles y texturas ya resueltos en drei. | 13-11-2026 | ✅ |
| T11 | La casa 3D se **modela por código** (paredes, techo paramétrico, aleros, canalones, ventanas, porche). Ver C34. | El techo se intercambia y se anima entre formas; UV exactas para las tejas; sin licencias ajenas. | 13-11-2026 | ✅ |
| T12 | Iluminación 3D con **HDRI CC0 guardado en el repo + sol direccional** con sombras suaves. Ver C35. | Reflejos y luz naturales (clave en metal y pizarra) sin depender de servicios externos. | 13-11-2026 | ✅ |
| T13 | Teja asfáltica: **3 lengüetas** con la textura CC0 `rooftop_0010` de TextureCan; **arquitectónica** con patrón laminado generado por script sobre el granulado de esa misma textura. Texturas en gris, teñidas con el color del catálogo. Ver C36. | No hay textura CC0 de teja arquitectónica estadounidense; así se consigue la forma correcta con granulado real. | 13-11-2026 | ✅ |
| T14 | Metal de junta alzada **sin textura descargada**: nervios reales en 3D cada ≈ 40 cm, pintura con barniz brillante, galvanizado como metal desnudo y ondulación leve generada por código. Ver C37. | No existe textura CC0 de junta alzada; en 3D el realismo sale de la geometría y del reflejo del HDRI. | 13-11-2026 | ✅ |
| T15 | Teja de barro o concreto con **ambientCG `RoofingTiles014A`** (CC0, teja curva en «S»), pasada a gris y teñida con el color del catálogo, con leve variación por pieza. Ver C38. | Perfil de «teja española» típico de EE. UU., limpio como un techo nuevo. | 13-11-2026 | ✅ |
| T16 | Pizarra con **Poly Haven `roof_slates_03`** (CC0, escaneo limpio y uniforme), teñida con el color del catálogo. Ver C39. | Aspecto de pizarra nueva y variación natural entre piezas. | 13-11-2026 | ✅ |
| T17 | Tejuela de cedro con **ambientCG `WoodSiding011`** (CC0, sin musgo), teñida con el color del catálogo. Ver C40. | Veta real, anchos irregulares y hileras de ≈ 20 cm, como el cedro partido. | 13-11-2026 | ✅ |
| T18 | Paredes con **revestimiento de tablas ambientCG `WoodSiding009`** (CC0) en blanco roto neutro, igual en todas las combinaciones. Ver C41. | Revestimiento típico de EE. UU. que no compite con el color del techo. | 13-11-2026 | ✅ |
| T19 | Suelo con **ambientCG `Grass004`** (césped) y **`Concrete048`** (entrada con acabado de escoba), ambos CC0 en 2K. Molduras, ventanas, puerta y canalones con materiales por código. Ver C42. | Césped escaneado natural y entrada típica de EE. UU. | 13-11-2026 | ✅ |
| T20 | Cámara con **giro limitado** (`CameraControls` de drei: ±70° horizontal, poco vertical, sin zoom con rueda, `touch-action: pan-y`) y **botones de vista** Frente / Esquina / Desde arriba; empieza en «Esquina»; cambio instantáneo con «reducir movimiento». Ver C43. | Interactivo, cumple WCAG 2.5.7 y no secuestra el desplazamiento. | 13-11-2026 | ✅ |
| T21 | Transiciones 3D: **deformación del techo** entre dos y cuatro aguas (≈ 0,9 s), **barrido de reinstalación** del alero a la cumbrera al cambiar de material (≈ 1,1 s, shader propio) y fundido de color (≈ 0,4 s); se interrumpen sin saltos; instantáneas con «reducir movimiento». Ver C44. | Aprovecha el 3D y continúa la idea del barrido 2D (C23). | 13-11-2026 | ✅ |
| T22 | Mientras carga el 3D: **indicador de carga** (esqueleto animado + porcentaje accesible); sin WebGL: recuadro con aviso de texto. Los controles y el anuncio `aria-live` funcionan siempre. Ver C46. | Lo más simple, sin imágenes que mantener. | 13-11-2026 | ✅ |
| T23 | Texturas en **WebP 2K, 3 mapas por material** (color, normal y ORM), convertidas con Python/Pillow; se carga solo el material elegido (más el anterior para el barrido) y el resto se precarga en reposo. Ver C47. | Calidad casi idéntica, repo ligero (≈ 15–20 MB) y sin descargar herramientas. | 13-11-2026 | ✅ |
| T24 | Posprocesado: **oclusión ambiental N8AO + ajuste de tono AgX + antialiasing MSAA ×4** (`@react-three/postprocessing`); calidad media automática en celulares; sin bloom, viñeta ni desenfoque. Ver C48. | Aspecto de foto y colores fieles al catálogo sin efectos de videojuego. | 13-11-2026 | ✅ |

## 5. Infraestructura y costos

| #   | Decisión                                                                                                                       | Por qué                                                         | Fecha      | Estado |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------- | ------ |
| I1  | **Costo cero por ahora**, sin registrar tarjetas en ningún servicio.                                                          | Requisito del cliente.                                          | 12-11-2026 | ✅     |
| I2  | Sitio y plataforma en **Cloudflare Pages**; API en **Render** (gratis); base de datos en **Neon**; fotos en **Cloudflare R2**; correo con **Resend**. | Planes gratuitos sin tarjeta.                     | 12-11-2026 | ✅     |
| I3  | **Vercel descartado:** su plan gratuito prohíbe el uso comercial.                                                             | Verificado en sus términos.                                     | 12-11-2026 | ✅     |
| I4  | **Google Cloud Run descartado por ahora:** exige tarjeta.                                                                      | Choca con I1.                                                   | 12-11-2026 | ✅     |
| I5  | Render gratuito **solo para desarrollo y pruebas**: se duerme a los 15 min y su documentación pide no usarlo en producción. Antes de atender clientes reales, pasar a plan de pago o servidor propio. | Verificado en su documentación. | 12-11-2026 | ✅ |
| I6  | Comprar un **dominio** (≈ 12–20 USD/año) antes del lanzamiento: sin dominio, el correo solo llega al dueño de la cuenta.        | Verificado en la documentación de Resend.                       | 12-11-2026 | ⏳     |
| I7  | Comprobar si **R2 pide tarjeta** al activarlo; si la pide, usar Backblaze B2.                                                  | Sus páginas no lo aclaran.                                      | 12-11-2026 | ⏳     |
| I8  | **Nunca hacer pagos reales, conectar tarjetas ni activar servicios con costo** sin autorización del dueño; avisar siempre de los riesgos. | Regla del cliente para todas las sesiones y agentes. | 12-11-2026 | ✅     |

## 6. Forma de trabajo

| #   | Decisión                                                                                                                  | Por qué                                                               | Fecha      | Estado |
| --- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------- | ------ |
| W1  | Repositorio **público** en GitHub: [TOTO05-a/roofing-business-platform](https://github.com/TOTO05-a/roofing-business-platform). | Minutos de CI ilimitados y protección de ramas gratis. Nunca se suben secretos. | 12-11-2026 | ✅ |
| W2  | Ramas `main` (estable) y `dev` (integración), **protegidas**: todo entra por PR con la CI en verde. Cada trabajo en su propia rama desde `dev`. | Orden y estabilidad.                   | 12-11-2026 | ✅     |
| W3  | **Commits convencionales en español** (p. ej. `feat(presupuestos): agrega cálculo de paquetes`).                          | Historial claro.                                                      | 12-11-2026 | ✅     |
| W4  | Carpeta del proyecto **fuera de OneDrive**: `C:\Users\ac138\dev\roofing-business-platform`.                               | OneDrive bloquea archivos y ralentiza las dependencias.              | 12-11-2026 | ✅     |
| W5  | Claude (Opus) coordina; la implementación la hacen agentes con Sonnet; cada cambio pasa por **revisión de código** y **pruebas** antes de fusionar. Máximo 2–3 trabajos en paralelo. | Calidad y uso eficiente.            | 12-11-2026 | ✅     |
| W6  | El agente `fullstack-web-engineer` se sustituye por `general-purpose` (Sonnet) en este proyecto.                          | Su skill de shadcn falla en la raíz de un monorepo.                   | 12-11-2026 | ✅     |
| W7  | Las decisiones nuevas se añaden **a este archivo**; el modelo de datos detallado vive en `arquitectura/modelo-datos.md`.  | Una sola fuente de verdad.                                            | 12-11-2026 | ✅     |
| W8  | **Toda decisión técnica se consulta** con el dueño antes de tomarla (no solo las de negocio).                               | Petición del cliente.                                                 | 12-11-2026 | ✅     |
| W9  | Cada decisión con varias opciones se registra con su **comparativa** en `COMPARATIVAS.md`.                                 | Petición del cliente: entender por qué se eligió cada opción.        | 12-11-2026 | ✅     |
| W10 | Los commits y PRs salen **solo con el nombre del dueño**, sin atribución a Claude.                                        | Petición del cliente.                                                 | 12-11-2026 | ✅     |
| W11 | **Modelo y esfuerzo según la tarea:** Haiku para búsquedas; Sonnet bajo para correcciones mecánicas y segundas revisiones; Sonnet medio para implementar y revisar código rutinario; Opus alto solo para seguridad, pagos, datos y autenticación. Instrucciones cortas que remiten a `docs/`. Ver C31. | Aprovechar el límite de uso sin perder calidad donde importa. | 13-11-2026 | ✅ |
| W12 | **La calidad visual no se sacrifica por peso:** si una optimización empeora el aspecto, se mantiene la versión anterior y se consulta. | Petición del cliente. | 13-11-2026 | ✅ |
| W13 | **La app no se lanzará:** la calidad visual realista tiene prioridad sobre el peso (sin dejar de ser fluida en un portátil normal). Ver C32. | Decisión del cliente. | 13-11-2026 | ✅ |

