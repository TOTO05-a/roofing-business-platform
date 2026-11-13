/*
 * Capturas del visualizador (390, 834 y 1512 px; dos y cuatro aguas). No forman parte de
 * `pnpm test:e2e` ni de la CI: se generan a mano con `pnpm test:capturas` en e2e/screenshots/.
 * Requiere `pnpm build` previo, igual que las pruebas e2e.
 */
import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { WEB, openVisualizer, settle } from '../helpers';

const SHOTS = resolve(import.meta.dirname, '..', 'screenshots');
const widths = [390, 834, 1512];
const shapes = [
  { id: 'dos-aguas', radio: 'Dos aguas' },
  { id: 'cuatro-aguas', radio: 'Cuatro aguas' },
] as const;

mkdirSync(SHOTS, { recursive: true });

for (const width of widths) {
  for (const shape of shapes) {
    test(`visualizador ${shape.id} @${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${WEB}/es/`);
      const section = await openVisualizer(page);
      // La cabecera fija, la barra móvil y el enlace "Saltar al contenido" se cuelan en las capturas.
      await page.addStyleTag({
        content:
          'header, a[href="#contenido"], [data-mobile-bar] { visibility: hidden !important; }',
      });
      await page.getByRole('radio', { name: shape.radio, exact: true }).click();
      await settle(page);
      const file = resolve(SHOTS, `visualizador-${shape.id}-${width}.png`);
      await section.screenshot({ path: file });
      console.log(`captura: ${file}`);
    });
  }
}
