import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = 'http://localhost:4321';
const APP = 'http://localhost:4173';
const SHOTS = resolve(import.meta.dirname, 'screenshots');
const widths = [390, 834, 1512];

const locales = [
  {
    code: 'es',
    gable: 'Dos aguas',
    hip: 'Cuatro aguas',
    slate: 'Pizarra',
    slateColor: 'Gris pizarra',
    announce: 'Techo: Pizarra, color Gris pizarra',
  },
  {
    code: 'en',
    gable: 'Gable',
    hip: 'Hip',
    slate: 'Slate',
    slateColor: 'Slate gray',
    announce: 'Roof: Slate, color Slate gray',
  },
] as const;

/** Espera a que terminen las animaciones (Motion, CSS) antes de medir o capturar. */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}

/** Lleva el visualizador a la vista y espera a que la isla de Astro se hidrate. */
async function openVisualizer(page: Page) {
  const section = page.locator('#techos');
  await section.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  return section;
}

async function seriousViolations(page: Page) {
  await settle(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

for (const l of locales) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`visualizador ${l.code} (${scheme}): sin violaciones serious/critical, también tras cambiar`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto(`${WEB}/${l.code}/`);
      await openVisualizer(page);
      expect(await seriousViolations(page)).toEqual([]);

      await page.getByRole('radio', { name: l.hip, exact: true }).click();
      await page.getByRole('radio', { name: l.slate, exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: l.slateColor })).toBeVisible();
      const violations = await seriousViolations(page);
      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });
  }

  test(`visualizador ${l.code}: teclado, anuncio aria-live y objetivos de 44 px`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${WEB}/${l.code}/`);
    await openVisualizer(page);

    const gable = page.getByRole('radio', { name: l.gable, exact: true });
    await gable.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: l.hip, exact: true })).toBeChecked();
    await expect(page.locator('svg[data-shape]')).toHaveAttribute('data-shape', 'hip');

    await page.getByRole('radio', { name: l.slate, exact: true }).click();
    const live = page.getByRole('status').filter({ hasText: l.slate });
    await expect(live).toHaveText(l.announce);
    await expect(live).toHaveAttribute('aria-live', 'polite');

    const radios = page.locator('#techos [role="radio"]');
    const count = await radios.count();
    expect(count).toBeGreaterThan(8);
    for (let i = 0; i < count; i++) {
      const box = await radios.nth(i).boundingBox();
      expect(box?.height ?? 0, `radio ${i}`).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0, `radio ${i}`).toBeGreaterThanOrEqual(44);
    }

    // El botón lleva al contacto.
    await expect(page.locator('#techos').getByRole('link')).toHaveAttribute(
      'href',
      `/${l.code}/#contacto`,
    );
  });
}

test.describe('animación de entrada', () => {
  test('se muestra una vez por sesión, se puede saltar y no vuelve', async ({ page }) => {
    await page.goto(`${WEB}/es/`);
    const overlay = page.locator('[data-intro-overlay]');
    await expect(overlay).toBeVisible();
    // No oculta el contenido a los lectores de pantalla.
    await expect(page.getByRole('heading', { level: 1 })).toBeAttached();
    const skip = page.getByRole('button', { name: 'Saltar la animación de entrada' });
    await skip.focus();
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(overlay).toBeHidden();
    await page.reload();
    await expect(overlay).toBeHidden();
    await page.goto(`${WEB}/en/`);
    await expect(overlay).toBeHidden();
  });

  test('termina sola en menos de 1,5 s', async ({ page }) => {
    await page.goto(`${WEB}/en/`);
    const overlay = page.locator('[data-intro-overlay]');
    await expect(overlay).toBeVisible();
    const started = Date.now();
    await expect(overlay).toBeHidden({ timeout: 3000 });
    expect(Date.now() - started).toBeLessThan(1700);
  });

  test('con movimiento reducido no se muestra', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${WEB}/es/`);
    await expect(page.locator('[data-intro-overlay]')).toBeHidden();
    await expect(page.getByRole('button', { name: /Saltar/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.dataset.intro)).toBeUndefined();
  });

  test('sin violaciones serious/critical mientras se muestra', async ({ page }) => {
    await page.goto(`${WEB}/es/`);
    await expect(page.locator('[data-intro-overlay]')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const violations = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});

test('catálogo /componentes: demostración del visualizador', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('lang', 'es'));
  await page.goto(`${APP}/componentes`);
  const section = page.locator('section', { has: page.locator('#sec-visualizer') });
  await section.scrollIntoViewIfNeeded();
  await section.getByRole('radio', { name: 'Cuatro aguas', exact: true }).click();
  await expect(section.locator('svg[data-shape]')).toHaveAttribute('data-shape', 'hip');
  await expect(section.getByRole('status')).toContainText('Techo: Teja asfáltica arquitectónica');
  expect(await seriousViolations(page)).toEqual([]);
});

test.describe('capturas del visualizador', () => {
  mkdirSync(SHOTS, { recursive: true });
  for (const l of locales) {
    for (const width of widths) {
      test(`visualizador ${l.code} @${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(`${WEB}/${l.code}/`);
        const section = await openVisualizer(page);
        if (l.code === 'en') {
          await page.getByRole('radio', { name: l.hip, exact: true }).click();
          await page.getByRole('radio', { name: 'Standing seam metal', exact: true }).click();
          await page.getByRole('radio', { name: 'Colonial red', exact: true }).click();
          await settle(page);
        }
        const file = resolve(SHOTS, `visualizador-${l.code}-${width}.png`);
        await section.screenshot({ path: file });
        console.log(`captura: ${file}`);
      });
    }
  }
});
