import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
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

// Solo caracteres seguros: ALTER ROLE no admite parámetros y así no hay nada que escapar
// (y SASLprep deja la contraseña igual, así que el verificador coincide con el de PostgreSQL).
const SAFE_PASSWORD = /^[A-Za-z0-9_-]{16,128}$/;
const SCRAM_ITERATIONS = 4096;

/**
 * Verificador SCRAM-SHA-256 en el formato de PostgreSQL (RFC 5802/7677). Se envía en lugar de
 * la contraseña en claro para que esta no quede en el log del servidor (log_statement = ddl).
 */
export function scramSha256Verifier(password: string, salt: Buffer = randomBytes(16)): string {
  const salted = pbkdf2Sync(password, salt, SCRAM_ITERATIONS, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${SCRAM_ITERATIONS}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

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
    // El verificador solo contiene [A-Za-z0-9+/=$:-]: no hay comillas que escapar.
    await owner.$executeRawUnsafe(
      `ALTER ROLE ${role} WITH LOGIN PASSWORD '${scramSha256Verifier(password)}'`,
    );
  }
}
