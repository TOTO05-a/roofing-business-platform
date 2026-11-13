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
| N10 | Mientras no haya datos reales, el sitio y la app usan **datos ficticios de demostración** (licencia, seguro, teléfono, correo, servicios, área, garantías), siempre con el aviso «Empresa y datos ficticios de demostración». Los datos **reales** siguen pendientes. | No inventar datos del negocio como si fueran reales, pero probar con datos verosímiles. | 13-11-2026 | ⏳ (datos reales) |
| N11 | La empresa ficticia se simula en el **Sur de Florida** (Miami-Dade, Broward y Palm Beach). Ver C32. | Licencia estatal única, impuesto solo sobre material y encaje con el sitio en español. | 13-11-2026 | ✅ |
| N12 | **Backend del CRM completo:** propiedades, leads (con conversión a cliente y propiedad), citas, inspecciones con medidas y fotos, archivos, formulario de contacto del sitio conectado y datos demo del CRM. Ver C36. | Los presupuestos necesitan inspecciones con medidas; hacer las fotos ahora evita reabrir el código. | 13-11-2026 | ✅ |

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
| D4  | **Visualizador de techos** en ilustración 2D (SVG), como **componente React** con materiales y colores reales del catálogo; formas **dos aguas y cuatro aguas**; casa en 3D queda para después. | Atractivo y ligero en celulares; reutilizable en presupuestos y portal. Ver C11 y C12. | 12-11-2026 | ✅     |
| D6  | **Transiciones 3D** en el visualizador como mejora futura; la capa de animación queda aislada para poder añadirlas. | Petición del cliente. | 13-11-2026 | ⏳ |
| D5  | Modo claro por defecto y **modo oscuro** opcional; diseño probado en 390, 834 y 1512 px.                                               | Comodidad y uso en cualquier dispositivo.                     | 12-11-2026 | ✅     |
| D7  | **Fotos de stock libre** (Unsplash) como fotos de demostración de la galería de proyectos, hasta tener fotos reales. Ver C33 y [`fotos-demo.md`](fotos-demo.md). | Realismo sin costo; no son obras de la empresa y así se indica. | 13-11-2026 | ✅ |

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
| T10 | **Seguridad por fila (RLS) en PostgreSQL desde ya:** rol `app_user` sin BYPASSRLS ni propiedad de las tablas, `ENABLE` + `FORCE` RLS en las tablas de personas y del CRM, contexto por transacción con `set_config` y pruebas de la matriz rol × tabla × operación en la CI. 404 si el recurso no es visible. Ver C37. | Cumple T5: un filtro olvidado en la API no expone datos de otros. | 13-11-2026 | ✅ |
| T11 | **Anti-spam del formulario público** sin servicios externos: campo trampa, tiempo mínimo de llenado y límite por IP y por correo; lo sospechoso se guarda como lead `SPAM` o se descarta. Ver C38. | Costo cero, privacidad y accesibilidad. | 13-11-2026 | ✅ |
| T12 | **Sin citas solapadas** por empleado: restricción EXCLUDE (`btree_gist`) en estados activos más comprobación previa en la API con error bilingüe. Ver C39. | Solo la base de datos garantiza que no haya dobles reservas simultáneas. | 13-11-2026 | ✅ |
| T13 | **Fotos en desarrollo** en un almacenamiento compatible con S3 dentro de `docker compose`, con el AWS SDK v3; bucket privado y URL firmadas de vida corta tras comprobar el acceso; validación de tipo, tamaño y sha256. R2 sigue sin activarse. Ver C40. | El mismo código servirá con R2, sin cuentas externas ni costo. | 13-11-2026 | ✅ |

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
| W13 | **La app no se lanzará a producción por ahora:** es una demostración. | Petición del cliente; no hay datos ni fotos reales todavía. | 13-11-2026 | ✅ |
| W14 | El ruleset de `main` y `dev` exige los checks **`verify` y `e2e`** para fusionar. Ver C34. | Evitar fusiones con pruebas de navegador o accesibilidad en rojo (como el PR #10). | 13-11-2026 | ✅ |
| W15 | Backend del CRM en dos fases: **Opus alto** hace esquema, migraciones, RLS y sus pruebas; **Sonnet medio** (`general-purpose`) hace rutas, servicios, formulario, fotos y seed; al final, auditoría de **`security-auditor`** (Opus alto) antes del PR. Ver C41. | Opus donde un error es caro; Sonnet para lo acotado (W11, C31). | 13-11-2026 | ✅ |
