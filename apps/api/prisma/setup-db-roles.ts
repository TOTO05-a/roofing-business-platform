/**
 * Activa los roles de conexión de la API (app_user y app_system) con las contraseñas de
 * APP_DB_PASSWORD y SYSTEM_DB_PASSWORD. Usa DATABASE_URL (el dueño de las tablas).
 * Ejecuta después de las migraciones: pnpm --filter @roofing/api db:roles
 */
import { z } from 'zod';
import { createDb } from '../src/lib/db.js';
import { setupDbRoles } from './db-roles.js';

const env = z
  .object({
    DATABASE_URL: z.url(),
    APP_DB_PASSWORD: z.string().min(16),
    SYSTEM_DB_PASSWORD: z.string().min(16),
  })
  .parse(process.env);

const owner = createDb(env.DATABASE_URL);
try {
  await setupDbRoles(owner, { appUser: env.APP_DB_PASSWORD, appSystem: env.SYSTEM_DB_PASSWORD });
  console.log('Roles app_user y app_system listos para conectarse.');
} finally {
  await owner.$disconnect();
}
