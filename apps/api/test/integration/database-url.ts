const DEFAULT_TEST_DATABASE_URL =
  'postgresql://roofing:roofing_dev_password@localhost:5432/roofing_test';

/**
 * URL de la base de datos de pruebas. Las pruebas vacían sus tablas, así que se exige que
 * el nombre contenga "test" para no apuntar por error a la base de desarrollo.
 */
export function testDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
  const name = new URL(raw).pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name) || !name.includes('test')) {
    throw new Error(
      `TEST_DATABASE_URL debe apuntar a una base cuyo nombre contenga "test" (recibido: "${name}")`,
    );
  }
  return raw;
}

/** Contraseñas de los roles de la API en la base de pruebas (las mismas que en .env.example). */
export const TEST_ROLE_PASSWORDS = {
  appUser: process.env.APP_DB_PASSWORD || 'app_user_dev_password',
  appSystem: process.env.SYSTEM_DB_PASSWORD || 'app_system_dev_password',
};

function withRole(role: string, password: string): string {
  const url = new URL(testDatabaseUrl());
  url.username = role;
  url.password = password;
  return url.toString();
}

/** URL de la base de pruebas con el rol app_user (la que usa la API para las personas). */
export function appTestDatabaseUrl(): string {
  return withRole('app_user', TEST_ROLE_PASSWORDS.appUser);
}

/** URL de la base de pruebas con el rol app_system (Better Auth, invitaciones, formulario). */
export function systemTestDatabaseUrl(): string {
  return withRole('app_system', TEST_ROLE_PASSWORDS.appSystem);
}
