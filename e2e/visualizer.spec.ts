import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { APP, WEB, locales, openVisualizer, seriousViolations } from './helpers';

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
    // Los radios nativos se mueven y marcan con las flechas.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: l.hip, exact: true })).toBeChecked();
    await expect(page.locator('svg[data-shape]')).toHaveAttribute('data-shape', 'hip');

    await page.getByRole('radio', { name: l.slate, exact: true }).click();
    const live = page.getByRole('status').filter({ hasText: l.slate });
    await expect(live).toHaveText(l.announce);
    await expect(live).toHaveAttribute('aria-live', 'polite');

    const radios = page.locator('#techos input[type="radio"]');
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

  test('dura como máximo 1,5 s (retardo + duración de cada animación) y se oculta sola', async ({
    page,
  }) => {
    await page.goto(`${WEB}/en/`);
    const overlay = page.locator('[data-intro-overlay]');
    await expect(overlay).toBeVisible();
    // Tiempos programados, no medidos con el reloj: no dependen de la velocidad de la máquina.
    const endTimes = await page.evaluate(() =>
      [...document.querySelectorAll('[data-intro-overlay], [data-intro-overlay] *')].flatMap((el) =>
        el.getAnimations().map((a) => {
          const t = a.effect?.getComputedTiming();
          return Number(t?.endTime ?? 0);
        }),
      ),
    );
    expect(endTimes.length).toBeGreaterThan(0);
    expect(Math.max(...endTimes)).toBeLessThanOrEqual(1500);
    await expect(overlay).toBeHidden({ timeout: 5000 });
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
    // Congela la intro en un instante con todo visible (tras el último trazo y la palabra, antes de
    // la salida a 1020 ms) para que axe no calcule contraste con opacidades intermedias.
    await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = 980;
      }
    });
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
  await expect(section.getByRole('status')).toContainText(
    'Techo, cuatro aguas: Teja asfáltica arquitectónica',
  );
  expect(await seriousViolations(page)).toEqual([]);
});
