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

---

## Datos de demostración (13-11-2026)

### C32. ¿En qué estado se simula la empresa? → N11

| Opción                | A favor                                                                                                                                   | En contra                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ✅ **Florida (Sur)**  | Licencia estatal única de contratista (no depende del municipio); impuesto de ventas del 6 % que se aplica solo sobre el material; mucha demanda de techos y de certificación de viento; encaja con un sitio en **español** (gran población hispanohablante) | Hay que explicar términos locales (wind mitigation, teja de barro)                     |
| Texas                 | Mercado grande de techos y granizo                                                                                                         | Sin licencia estatal para techos; menos encaje con el sitio en español que Miami       |
| Arizona               | Techo plano y teja muy comunes; clima soleado                                                                                              | Reglas y mercado menos conocidos; menos demanda de certificaciones de viento           |

**Por qué:** Florida da una historia coherente (licencia estatal, impuesto solo sobre material, wind mitigation, teja de barro y metal) y un público que encaja con el español como idioma principal. Todos los datos (licencia `CCC-DEMO-0001`, teléfono `(305) 555-0142`, correo `@cresta-roofing.example`) son ficticios y están marcados como demostración.

### C33. Fotos de techos: ¿de dónde salen? → D7

| Opción                                         | A favor                                                              | En contra                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ✅ **Stock libre (Unsplash o Pexels)**         | Realismo fotográfico; costo cero; licencia que permite uso comercial | No son obras de la empresa; algunas no son del Sur de Florida; hay que citar la fuente |
| Imágenes generadas con IA                      | Se pueden pedir a medida                                             | Consumen créditos; aspecto artificial; riesgo de que parezcan trabajos reales |
| Capturas del visualizador 3D                   | Sin costo; coherentes con la app                                     | Parecen maquetas, no obras reales; calidad variable                       |
| Ilustraciones SVG                              | Muy ligeras                                                          | Nada realistas para una galería de proyectos                              |

**Por qué:** el realismo y el costo cero pesan más que tener fotos propias; se indica siempre que son fotos de demostración. Fuentes y autores en [`fotos-demo.md`](fotos-demo.md).


## Calidad de las fusiones (13-11-2026)

### C34. ¿El check `e2e` es obligatorio para fusionar? → W14

| Opción                        | A favor                                                         | En contra                                                       |
| ----------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| ✅ **Obligatorio en `main` y `dev`** | Ningún PR entra con accesibilidad o pantallas rotas         | Cada PR espera unos minutos más; una prueba inestable bloquea   |
| Solo en `main`                | `dev` más ágil                                                  | Los fallos se acumulan en `dev` y aparecen tarde                |
| Solo `verify` (como antes)    | Sin esperas                                                     | Puede repetirse lo del PR #10, fusionado con el e2e en rojo     |

**Por qué:** el repositorio es público (CI gratis) y el e2e protege la accesibilidad WCAG 2.2 AA (D2). El ruleset «Proteger main y dev» exige ahora `verify` y `e2e`.

---

## Etapa 2 · Backend del CRM (13-11-2026)

### C36. Alcance del backend del CRM → N12

| Opción | A favor | En contra |
| --- | --- | --- |
| ✅ **Completo: propiedades, leads, citas, inspecciones con medidas y fotos, archivos, formulario web y datos demo** | Cubre todo el camino del contacto a la inspección; los presupuestos pueden partir de medidas reales | Etapa más larga; exige almacenamiento de fotos ya |
| CRM básico sin inspecciones | Rápido | El motor de presupuestos no tendría medidas de donde partir |
| Con inspecciones pero sin fotos | Evita el almacenamiento por ahora | La inspección queda a medias; habría que volver a tocarla |

**Por qué:** la siguiente etapa (presupuestos) necesita inspecciones con medidas; hacer las fotos ahora evita reabrir el mismo código. El formulario del sitio crea leads `WEB_FORM` y el seed demo (`SEED_DEMO=true`) llena el CRM con datos ficticios del Sur de Florida.

### C37. ¿Seguridad por fila (RLS) ahora o después? → T10

| Opción | A favor | En contra |
| --- | --- | --- |
| ✅ **Ahora, según el modelo §4.4** | Protege desde la primera tabla con datos de clientes; las rutas nuevas nacen con la doble capa | Más trabajo en esta etapa; hay que adaptar las rutas existentes |
| En una etapa propia | Etapa actual más corta | Todas las rutas del CRM se reescribirían después |
| Solo el filtro de la API | Lo más simple | Un filtro olvidado expone datos de otros clientes |

**Por qué:** T5 promete doble protección. Rol `app_user` sin BYPASSRLS ni propiedad de las tablas, `ENABLE` + `FORCE` RLS en las tablas de personas y del CRM, `set_config(..., true)` por transacción con una extensión del cliente Prisma, funciones auxiliares en un esquema privado y pruebas de la matriz rol × tabla × operación en la CI. Si el recurso existe pero no es visible, la API responde 404.

### C38. Spam en el formulario público → T11

| Opción | A favor | En contra |
| --- | --- | --- |
| ✅ **Campo trampa + tiempo mínimo de llenado + límite por IP y por correo** | Sin servicios externos ni costo; invisible para personas reales; accesible | No frena a un atacante decidido |
| Cloudflare Turnstile | Muy eficaz y gratis | Servicio externo, script de terceros y cuenta |
| Google reCAPTCHA | Conocido | Rastreo de Google; peor accesibilidad y privacidad |
| Ninguna | Nada que hacer | El CRM se llena de basura |

**Por qué:** basta para el volumen de una empresa local y respeta I1 (costo cero) y la privacidad. Los envíos sospechosos se guardan como lead `SPAM` o se descartan.

### C39. Citas solapadas del mismo empleado → T12

| Opción | A favor | En contra |
| --- | --- | --- |
| ✅ **EXCLUDE con `btree_gist` sobre (`assignee_id`, rango de horas) en estados activos + comprobación previa en la API** | La base de datos garantiza que no hay solapes aunque lleguen peticiones simultáneas; la API da un error claro y bilingüe | Requiere la extensión `btree_gist` |
| Solo comprobación en la API | Simple | Dos peticiones a la vez pueden crear el solape |
| Permitir el solape y avisar | Flexible | Dobles reservas reales con clientes |

**Por qué:** una doble reserva es un error caro frente al cliente; la restricción en la base es la única garantía real.

### C40. Almacenamiento de fotos en desarrollo → T13, T14

| Opción | A favor | En contra |
| --- | --- | --- |
| ✅ **Almacenamiento compatible con S3 en `docker compose` + AWS SDK v3** | El mismo código servirá con Cloudflare R2; URL firmadas y bucket privado igual que en producción; sin cuentas externas | Un contenedor más en local |
| Carpeta local | Lo más simple | Código distinto al de producción; sin URL firmadas reales |
| Activar R2 ya | Entorno real | Puede pedir tarjeta (I7); choca con I1 |

**Por qué:** probar en local exactamente el flujo de producción (URL firmadas de vida corta emitidas tras comprobar el acceso; validación de tipo MIME, tamaño y sha256) sin activar ningún servicio externo. MinIO quedó descartado.

| Motor local (T14) | A favor | En contra |
| --- | --- | --- |
| ✅ **Garage** | Mantenido, imagen oficial, muy ligero (Rust), modo de un solo nodo con clave y bucket por defecto | Licencia AGPL (solo herramienta de desarrollo, no se distribuye) |
| SeaweedFS | Mantenido, imagen oficial, muchas funciones | Más memoria: arranca maestro, volumen, filer y S3 en el mismo proceso |
| MinIO | Muy conocido | Descartado por el usuario (edición comunitaria archivada) |

### C41. Quién implementa la etapa → W15

| Opción | A favor | En contra |
| --- | --- | --- |
| ✅ **Opus alto: esquema, migraciones, RLS y pruebas; Sonnet medio: rutas, servicios, formulario, fotos y seed; auditoría final de `security-auditor` (Opus alto)** | Lo crítico (datos y acceso) con el modelo más capaz; lo repetitivo, más barato; revisión independiente antes del PR | Coordinación en dos fases |
| Todo con Opus alto | Máxima calidad en todo | Gasta mucho más límite de uso en código rutinario |
| Todo con Sonnet y auditoría de Opus | Lo más barato | La RLS y las migraciones son donde un error cuesta más |

**Por qué:** aplica W11 y C31: Opus donde un error es caro (seguridad y datos), Sonnet para la implementación acotada.
