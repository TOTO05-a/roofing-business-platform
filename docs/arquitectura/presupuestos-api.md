# API de catálogo y presupuestos

Estado: implementada (Etapa 3, decisiones N13, N14 y T30). Todas las rutas cuelgan de `/api`, exigen sesión y usan la RLS de PostgreSQL (T25). Si algo existe pero no es visible, la respuesta es 404, nunca 403. Detalle del modelo en [`modelo-datos.md`](modelo-datos.md) §8.

## Quién puede qué

| Rol                   | Catálogo             | Presupuestos                                                                         |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| ADMIN / SUPERADMIN    | Todo (P10)           | Crear, editar el borrador, descuento, enviar, revisar, rechazar y caducar; ven todos |
| EMPLOYEE de ventas    | Nada (lleva precios) | Solo lectura de SUS presupuestos enviados (P6)                                       |
| EMPLOYEE de cuadrilla | Nada                 | Nada: no ve precios                                                                  |
| CUSTOMER              | Nada                 | Sus presupuestos ya enviados: leer, marcar visto, rechazar, descargar el PDF         |

## Catálogo (solo administración)

| Método y ruta                                                                        | Qué hace                                                                                  |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `GET/POST /catalog/categories`, `PATCH /catalog/categories/:id`                      | Categorías (`kind` MATERIAL o LABOR)                                                      |
| `GET/POST /catalog/items`, `GET/PATCH/DELETE /catalog/items/:id`                     | Artículos; precios en centavos; el borrado es lógico y falla si está en un paquete activo |
| `POST /catalog/items/:id/purchase-units`, `PATCH/DELETE /catalog/purchase-units/:id` | Unidades de compra (rollo, caja…); una por defecto                                        |
| `POST /catalog/items/:id/material-options`, `PATCH /catalog/material-options/:id`    | Colores y texturas                                                                        |
| `GET/POST /catalog/packages`, `GET/PATCH /catalog/packages/:id`                      | Paquetes (varios por nivel, P3); con `lines` en el PATCH se reemplazan las líneas         |

## Presupuestos

| Método y ruta                         | Qué hace                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /quotes`                        | Crea el presupuesto y su versión 1 en borrador. Cuerpo: `propertyId`, `packageIds` (1–10), `inspectionId` (completada) **o** `measurements`, `parameters` opcionales (`wasteBps` 1000, `taxBps` 700, `taxAppliesToLabor` false, `discountBps` 0, `depositBps` 5000), `salesRepId`, `locale`, `notes` |
| `GET /quotes`, `GET /quotes/:id`      | Listado con la última versión visible y detalle con todas sus versiones                                                                                                                                                                                                                              |
| `GET /quotes/:id/versions/:versionId` | Versión con opciones y líneas                                                                                                                                                                                                                                                                        |
| `PATCH …/versions/:versionId`         | Edita el borrador (parámetros, paquetes, medidas, `validUntil`, notas) y recalcula                                                                                                                                                                                                                   |
| `POST /quotes/:id/versions`           | Nueva versión (revisión): copia parámetros, medidas y paquetes de la última y **recalcula con el catálogo vigente**; solo si no hay otra en borrador                                                                                                                                                 |
| `POST …/versions/:versionId/send`     | Envía: bloquea la fila, recalcula con el catálogo vigente, genera el PDF, lo guarda en S3 con su sha256, fija `locked_at`, congela y pasa las versiones anteriores a SUPERSEDED                                                                                                                      |
| `POST …/view`, `POST …/decline`       | El cliente marca vista (idempotente) o rechaza; la oficina también puede rechazar                                                                                                                                                                                                                    |
| `POST …/expire`                       | Caducidad manual, solo si ya pasó `valid_until` (la automática queda pendiente, N14)                                                                                                                                                                                                                 |
| `GET …/pdf`                           | URL firmada de 5 minutos para descargar el PDF                                                                                                                                                                                                                                                       |

Errores propios: `INVALID_TRANSITION` (409), `VERSION_LOCKED` (409), `DRAFT_EXISTS` (409), `NOT_EXPIRED_YET` (409), `STORAGE_NOT_CONFIGURED` (503) y los del motor (`QUOTE_INPUT_INVALID`, `UNKNOWN_ITEM`… 422).

## Cálculo (motor `packages/shared/src/presupuestos`)

La API solo arma la entrada desde la base y guarda el resultado; ninguna regla de dinero vive en `apps/api`. Descuento antes del impuesto y repartido entre material y mano de obra (P11); impuesto sobre material y, opcionalmente, mano de obra (P4); anticipo en porcentaje por presupuesto (P5); centavos enteros y puntos básicos con redondeo half-up (P13); sin margen (P12). Los cambios de precio del catálogo no afectan a lo ya enviado: las líneas son copias.

## Datos demo y pruebas

- `SEED_DEMO=true pnpm --filter @roofing/api db:seed` crea el catálogo ficticio (descripción «Precio ficticio de demostración»), cuatro paquetes y cuatro presupuestos (borrador, enviado, visto y rechazado). Los enviados guardan su PDF en Garage (`docker compose up -d garage`, variables `S3_*`); sin almacenamiento solo se crea el borrador.
- `apps/api/test/integration/quotes.test.ts` (rutas) y `quotes-rls.test.ts` (matriz de RLS e inmutabilidad).
