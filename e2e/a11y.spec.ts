import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { me, mockApi } from './support/api';
import { seriousViolations, settle } from './support/a11y';

// Las páginas con el visualizador 3D tardan en cargar con WebGL por software: más margen que 30 s.
test.describe.configure({ timeout: 90_000 });

const WEB = 'http://localhost:4321';
const APP = 'http://localhost:4173';
const SHOTS = resolve(import.meta.dirname, 'screenshots');
const widths = [390, 834, 1512];

const pages = [
  { name: 'web-es', url: `${WEB}/es/` },
  { name: 'web-en', url: `${WEB}/en/` },
  { name: 'app-componentes', url: `${APP}/componentes` },
];

for (const scheme of ['light', 'dark'] as const) {
  for (const p of pages) {
    test(`${p.name} (${scheme}) sin violaciones serious/critical`, async ({ page }) => {
      await mockApi(page, { 'GET /api/me': me('CUSTOMER') });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto(p.url);
      await page.locator('main').first().waitFor();
      const violations = await seriousViolations(page);
      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });
  }
}

test('formulario inválido: errores visibles, sin violaciones y traducibles', async ({ page }) => {
  await mockApi(page, { 'GET /api/me': me('CUSTOMER') });
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

test('cambiar de idioma en la app no mueve el foco ni el scroll', async ({ page }) => {
  await mockApi(page, { 'GET /api/me': me('CUSTOMER') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('lang', 'es'));
  await page.goto(`${APP}/componentes`);
  await page.locator('main').waitFor();
  await page.evaluate(() => window.scrollTo(0, 400));
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);
  const english = page.getByRole('button', { name: 'English' });
  // Se activa con teclado: `click()` de Playwright hace scrollIntoView sobre el elemento sticky.
  await english.evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(english).toBeFocused();
  // No vuelve al inicio; solo se tolera el reajuste por textos de distinta longitud.
  const after = await page.evaluate(() => window.scrollY);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(60);
});

test('ruta de otro rol: página 403 accesible y traducida', async ({ page }) => {
  await mockApi(page, { 'GET /api/me': me('CUSTOMER') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('lang', 'es'));
  await page.goto(`${APP}/agenda`);
  await expect(page.getByText('Su rol no tiene permiso para ver esta sección.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Acceso denegado');
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'English' }).click();
  await expect(
    page.getByText('Your role does not have permission', { exact: false }),
  ).toBeVisible();
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
        await mockApi(page, { 'GET /api/me': me('CUSTOMER') });
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(p.url);
        await page.locator('main').first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        await settle(page);
        const file = resolve(SHOTS, `${p.name}-${width}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`captura: ${file}`);
      });
    }
  }
});
