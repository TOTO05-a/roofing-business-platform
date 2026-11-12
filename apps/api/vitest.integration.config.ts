import { defineConfig } from 'vitest/config';

// Pruebas de integración contra PostgreSQL (TEST_DATABASE_URL; ver test/integration/setup-db.ts).
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/integration/setup-db.ts'],
    // Todas comparten una base de datos: se ejecutan en serie.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
