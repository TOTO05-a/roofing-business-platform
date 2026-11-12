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
pnpm dev                  # web, app y API en paralelo
```

| Servicio            | URL                                      |
| ------------------- | ---------------------------------------- |
| Sitio público       | http://localhost:4321/es/                |
| Plataforma          | http://localhost:5173                    |
| Catálogo de diseño  | http://localhost:5173/componentes        |
| API                 | http://localhost:3000/api/health         |
| Correos de prueba   | http://localhost:8025 (Mailpit)          |

## Calidad

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm exec playwright install chromium   # solo la primera vez
pnpm test:e2e                           # accesibilidad y capturas en 390/834/1512 px
```

La CI ejecuta lo mismo en cada PR hacia `dev` y `main`.
