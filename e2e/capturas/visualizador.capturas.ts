/*
 * Capturas del visualizador 3D (390 y 1512 px; formas y materiales). No forman parte de
 * `pnpm test:e2e` ni de la CI: se generan a mano con `pnpm test:capturas` en e2e/screenshots/.
 * Requiere `pnpm build` previo, igual que las pruebas e2e. Usa la GPU real si está disponible
 * (ANGLE/D3D11 en Windows); si no, Chromium cae a WebGL por software y tarda más.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { WEB, openVisualizer } from '../helpers';

const SHOTS = resolve(import.meta.dirname, '..', 'screenshots');
mkdirSync(SHOTS, { recursive: true });

test.use({
  launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
});
test.setTimeout(120_000);

const cases = [
  { id: 'arquitectonica-dos-aguas', shape: 'Dos aguas', material: null, widths: [390, 1512] },
  {
    id: 'arquitectonica-cuatro-aguas',
    shape: 'Cuatro aguas',
    material: null,
    widths: [390, 1512],
  },
  {
    id: '3-lenguetas',
    shape: 'Dos aguas',
    material: 'Teja asfáltica de 3 lengüetas',
    widths: [1512],
  },
  { id: 'metal', shape: 'Cuatro aguas', material: 'Metal de junta alzada', widths: [390, 1512] },
  { id: 'barro', shape: 'Cuatro aguas', material: 'Teja de barro o concreto', widths: [1512] },
  { id: 'pizarra', shape: 'Dos aguas', material: 'Pizarra', widths: [1512] },
  { id: 'cedro', shape: 'Dos aguas', material: 'Tejuela de cedro', widths: [1512] },
] as const;

/** Espera a que la escena 3D termine de cargar y pinte algunos fotogramas. */
async function sceneReady(page: Page) {
  const section = page.locator('#techos');
  await expect(section.locator('[data-shape][data-webgl="ok"]')).toBeAttached({ timeout: 90_000 });
  await expect(section.locator('[role="progressbar"]')).toHaveCount(0, { timeout: 90_000 });
  await expect(section.locator('[data-shape] canvas').first()).toBeVisible();
  await page.waitForTimeout(2500);
}

for (const c of cases) {
  for (const width of c.widths) {
    test(`visualizador ${c.id} @${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${WEB}/es/`);
      const section = await openVisualizer(page);
      await page.addStyleTag({
        content:
          'header, a[href="#contenido"], [data-mobile-bar] { visibility: hidden !important; }',
      });
      await page.getByRole('radio', { name: c.shape, exact: true }).click();
      if (c.material) await page.getByRole('radio', { name: c.material, exact: true }).click();
      await sceneReady(page);
      const file = resolve(SHOTS, `visualizador-3d-${c.id}-${width}.png`);
      await section.screenshot({ path: file });
      // Solo la escena, con el lienzo en pantalla (la captura de sección puede desplazar la página).
      const scene = section.locator('[role="img"][data-shape]');
      await scene.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await scene.screenshot({ path: file.replace('.png', '-escena.png') });
      console.log(`captura: ${file}`);
    });
  }
}
