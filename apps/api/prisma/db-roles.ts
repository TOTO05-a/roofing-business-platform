import type { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Da LOGIN y contraseña a los roles de la API (app_user y app_system). La migración de RLS los
 * crea sin LOGIN porque una migración versionada no puede llevar contraseñas. Se ejecuta con
 * la conexión del dueño (DATABASE_URL). Los roles son del clúster de PostgreSQL: en local,
 * la base de desarrollo y la de pruebas comparten las mismas contraseñas.
 */
export interface DbRolePasswords {
  appUser: string;
  appSystem: string;
}

// Solo caracteres seguros: ALTER ROLE no admite parámetros y así no hay nada que escapar.
const SAFE_PASSWORD = /^[A-Za-z0-9_-]{16,128}$/;

export async function setupDbRoles(owner: PrismaClient, passwords: DbRolePasswords): Promise<void> {
  for (const [role, password] of [
    ['app_user', passwords.appUser],
    ['app_system', passwords.appSystem],
  ] as const) {
    if (!SAFE_PASSWORD.test(password)) {
      throw new Error(
        `La contraseña de ${role} debe tener 16–128 caracteres de [A-Za-z0-9_-] (sin comillas ni espacios)`,
      );
    }
    const exists = await owner.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${role}) AS "exists"`;
    if (!exists[0]?.exists) {
      throw new Error(`El rol ${role} no existe: aplica antes las migraciones (db:deploy)`);
    }
    await owner.$executeRawUnsafe(`ALTER ROLE ${role} WITH LOGIN PASSWORD '${password}'`);
  }
}
