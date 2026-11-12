import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'prisma/config';

// Prisma 7 no carga .env por sí solo. Se leen solo las variables que aún no estén
// definidas, para que el entorno (CI, pruebas) siempre tenga prioridad.
if (existsSync('.env')) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync('.env', 'utf8')))) {
    process.env[key] ??= value;
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file-if-exists=.env prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` no necesita conexión; las migraciones sí.
    url: process.env.DATABASE_URL ?? '',
    // Solo para `prisma migrate diff --from-migrations` (comprobación de CI); se vacía al usarla.
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});
