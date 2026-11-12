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
