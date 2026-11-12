import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Requiere `pnpm build` previo: se sirven las versiones compiladas.
  webServer: [
    {
      command: 'pnpm --filter @roofing/web exec astro preview --port 4321',
      url: 'http://localhost:4321/es/',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @roofing/app exec vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173/',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
