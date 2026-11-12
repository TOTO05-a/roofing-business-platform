import { execSync } from 'node:child_process';
import { createDb } from '../../src/lib/db.js';
import { testDatabaseUrl } from './database-url.js';

/**
 * Prepara la base de datos de pruebas antes de la suite de integración:
 * la crea si no existe y aplica las migraciones versionadas (prisma migrate deploy).
 */
export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const databaseName = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = createDb(adminUrl.toString());
  try {
    const rows = await admin.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${databaseName}) AS "exists"`;
    if (!rows[0]?.exists) {
      // El nombre ya se validó (solo [a-z0-9_] y contiene "test"); CREATE DATABASE no admite parámetros.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
}
