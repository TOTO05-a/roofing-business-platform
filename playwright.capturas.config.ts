import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Solo las capturas del visualizador: `pnpm test:capturas`. No se ejecuta en la CI. */
export default defineConfig({
  ...base,
  testDir: './e2e/capturas',
  testMatch: '**/*.capturas.ts',
  testIgnore: [],
  reporter: 'list',
  retries: 0,
});
