# Roofing Business Platform

Plataforma web para una empresa de roofing residencial en EE. UU.: sitio público bilingüe (español/inglés) y plataforma interna con portal de clientes, herramientas para empleados y administración.

- Planificación y decisiones: [`docs/planificacion/`](docs/planificacion/)
- Ramas: `main` (estable) · `dev` (integración) · ramas de trabajo desde `dev`
- Commits: convencionales en español, p. ej. `feat(presupuestos): agrega cálculo de paquetes`

## Estructura

| Carpeta           | Qué es                                                         |
| ----------------- | -------------------------------------------------------------- |
| `apps/web`        | Sitio público (Astro), rutas `/es/` y `/en/`                   |
| `apps/app`        | Plataforma interna (React + Vite)                              |
| `apps/api`        | API (Node.js + Express + TypeScript)                           |
| `packages/ui`     | Sistema de diseño: tokens, componentes y movimiento            |
| `packages/shared` | Código compartido: esquemas Zod, utilidades y textos es/en     |
| `packages/config` | Configuración compartida de TypeScript y ESLint                |

## Cómo levantar el proyecto

Requisitos: Node 26 (ver `.nvmrc`), pnpm 12 y Docker Desktop.

```bash
pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
docker compose up -d      # PostgreSQL y Mailpit
pnpm --filter @roofing/api db:deploy   # migraciones (con el dueño, DATABASE_URL)
pnpm --filter @roofing/api db:roles    # da LOGIN a app_user y app_system (seguridad por fila)
pnpm --filter @roofing/api db:seed     # opcional: superadmin y datos demo (SEED_DEMO=true)
pnpm dev                  # web, app y API en paralelo
```

La API se conecta con los roles `app_user` y `app_system`, que no saltan la seguridad por fila
(RLS); si se le da el usuario dueño o un superusuario, se niega a arrancar.

| Servicio            | URL                                      |
| ------------------- | ---------------------------------------- |
| Sitio público       | http://localhost:4321/es/                |
| Plataforma          | http://localhost:5173                    |
| Catálogo de diseño  | http://localhost:5173/componentes        |
| API                 | http://localhost:3000/api/health         |
| Correos de prueba   | http://localhost:8025 (Mailpit)          |
| Fotos (S3, Garage)  | http://localhost:3900 (solo con la API)  |

### Fotos de inspección (Garage)

Las fotos se guardan en un almacenamiento compatible con S3. En desarrollo es
[Garage](https://garagehq.deuxfleurs.fr/) (un solo nodo, bucket privado, solo escucha en
`127.0.0.1`; decisiones T13 y T14). La API nunca recibe los bytes: emite URL firmadas de 5 minutos.

```bash
docker compose up -d garage               # solo este servicio
pnpm --filter @roofing/api storage:init   # primera vez: nodo, bucket privado, clave de desarrollo y CORS
```

Las variables `S3_*` de `apps/api/.env.example` ya apuntan a este Garage. Sin ellas, las rutas de
fotos responden `503 STORAGE_NOT_CONFIGURED`. Las pruebas usan un almacenamiento falso en memoria.

## Calidad

```bash
# Los builds de producción exigen PUBLIC_SITE_URL (la web) y el e2e necesita el catálogo:
export PUBLIC_SITE_URL=https://example.com VITE_ENABLE_SHOWCASE=true
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm exec playwright install chromium   # solo la primera vez
pnpm test:e2e                           # accesibilidad y capturas en 390/834/1512 px
```

Pruebas de integración de la API (incluida la matriz de RLS), contra PostgreSQL:

```bash
pnpm --filter @roofing/api test:integration   # usa TEST_DATABASE_URL (nombre con "test")
```

La CI ejecuta lo mismo en cada PR hacia `dev` y `main`.
