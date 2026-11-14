import { defineConfig } from 'vitest/config';

// Pruebas unitarias: no necesitan base de datos.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**', '**/node_modules/**'],
  },
});
