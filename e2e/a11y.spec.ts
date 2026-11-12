import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = 'http://localhost:4321';
const APP = 'http://localhost:4173';
const SHOTS = resolve(import.meta.dirname, 'screenshots');
const widths = [390, 834, 1512];

const pages = [
  { name: 'web-es', url: `${WEB}/es/` },
  { name: 'web-en', url: `${WEB}/en/` },
  { name: 'app-componentes', url: `${APP}/componentes` },
];

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

for (const scheme of ['light', 'dark'] as const) {
  for (const p of pages) {
    test(`${p.name} (${scheme}) sin violaciones serious/critical`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto(p.url);
      await page.locator('main').first().waitFor();
      const violations = await seriousViolations(page);
      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });
  }
}

test('formulario inválido: errores visibles, sin violaciones y traducibles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('lang', 'es'));
  await page.goto(`${APP}/componentes`);
  await page.getByRole('button', { name: /enviar solicitud/i }).click();
  await expect(page.getByText('Este campo es obligatorio.').first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByText('This field is required.').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('menú móvil de la web: Escape cierra y devuelve el foco', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${WEB}/es/`);
  const button = page.locator('[data-menu-button]');
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-movil')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeFocused();
});

test('selector de idioma de la web lleva a la página equivalente', async ({ page }) => {
  await page.goto(`${WEB}/es/`);
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(`${WEB}/en/`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/en\/$/);
  await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute('href', /\/es\/$/);
});

test.describe('capturas de pantalla', () => {
  mkdirSync(SHOTS, { recursive: true });
  for (const p of pages) {
    for (const width of widths) {
      test(`${p.name} @${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(p.url);
        await page.locator('main').first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        const file = resolve(SHOTS, `${p.name}-${width}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`captura: ${file}`);
      });
    }
  }
});
