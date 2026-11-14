import { execSync } from 'node:child_process';
import { setupDbRoles } from '../../prisma/db-roles.js';
import { createDb } from '../../src/lib/db.js';
import { TEST_ROLE_PASSWORDS, testDatabaseUrl } from './database-url.js';

/**
 * Prepara la base de datos de pruebas antes de la suite de integración: la crea si no
 * existe, la deja vacía (es desechable; `testDatabaseUrl` exige que su nombre contenga
 * "test"), aplica las migraciones versionadas con `prisma migrate deploy`, igual que en
 * producción, y da LOGIN a los roles de la API (app_user y app_system).
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

  const testDb = createDb(url.toString());
  try {
    await testDb.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await testDb.$executeRawUnsafe('DROP SCHEMA IF EXISTS app CASCADE');
    await testDb.$executeRawUnsafe('CREATE SCHEMA public');
  } finally {
    await testDb.$disconnect();
  }

  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url.toString() },
  });

  const owner = createDb(url.toString());
  try {
    await setupDbRoles(owner, TEST_ROLE_PASSWORDS);
  } finally {
    await owner.$disconnect();
  }
}
