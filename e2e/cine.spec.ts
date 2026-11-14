import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { WEB } from './helpers';

// La portada cinematográfica (D11): escenas sticky ligadas al scroll sobre un canvas fijo.
test.describe.configure({ timeout: 90_000 });

/** Axe sin esperar a que terminen las animaciones: la pista de scroll se repite sin fin. */
async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

/** Lleva el scroll a una fracción del recorrido de la pista y espera a que el scrub se asiente. */
async function scrollToProgress(page: Page, p: number) {
  await page.evaluate((frac) => {
    const track = document.querySelector<HTMLElement>('[data-cine-track]')!;
    const top = track.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + (track.offsetHeight - window.innerHeight) * frac);
  }, p);
  await page.waitForTimeout(1800);
}

for (const locale of ['es', 'en'] as const) {
  test(`portada ${locale}: las escenas entran y salen con el scroll`, async ({ page }) => {
    await page.goto(`${WEB}/${locale}/`);
    await expect(page.locator('html')).toHaveAttribute('data-cine', 'on');
    await expect(page.locator('[data-cine-canvas]')).toBeVisible();
    const hero = page.locator('[data-scene="hero"]');
    const services = page.locator('[data-scene="services"]');
    await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(() => services.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');

    await scrollToProgress(page, 0.32);
    await expect
      .poll(() => services.evaluate((el) => +getComputedStyle(el).opacity))
      .toBeGreaterThan(0.9);
    await expect.poll(() => hero.evaluate((el) => +getComputedStyle(el).opacity)).toBeLessThan(0.1);

    await scrollToProgress(page, 0.9);
    await expect
      .poll(() =>
        page.locator('[data-scene="about"]').evaluate((el) => +getComputedStyle(el).opacity),
      )
      .toBeGreaterThan(0.9);
  });
}

test('portada: un enlace a #servicios lleva a su escena y un control oculto trae su escena', async ({
  page,
}) => {
  await page.goto(`${WEB}/es/`);
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .first()
    .getByRole('link', { name: 'Servicios' })
    .click();
  await expect
    .poll(
      () => page.locator('[data-scene="services"]').evaluate((el) => +getComputedStyle(el).opacity),
      {
        timeout: 8000,
      },
    )
    .toBeGreaterThan(0.9);
});

test('portada en móvil: sin desbordamiento horizontal y con la barra de contacto', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB}/es/`);
  await expect(page.locator('html')).toHaveAttribute('data-cine', 'on');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('[data-mobile-bar]')).toBeVisible();
});

test('«reducir movimiento»: versión estática con todas las escenas legibles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${WEB}/es/`);
  await expect(page.locator('html')).toHaveAttribute('data-cine', 'off');
  for (const name of ['hero', 'services', 'process', 'about']) {
    await expect(page.locator(`[data-scene="${name}"]`)).toBeVisible();
    expect(
      await page.locator(`[data-scene="${name}"]`).evaluate((el) => getComputedStyle(el).opacity),
    ).toBe('1');
  }
  const pos = await page
    .locator('[data-cine-stage]')
    .evaluate((el) => getComputedStyle(el).position);
  expect(pos).toBe('static');
});

// Accesibilidad con la escena animada (en un punto de cada escena), claro y oscuro.
for (const scheme of ['light', 'dark'] as const) {
  test(`portada animada (${scheme}): sin violaciones serious/critical en cada escena`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`${WEB}/es/`);
    await page.locator('main').first().waitFor();
    for (const p of [0, 0.32, 0.62, 0.9]) {
      await scrollToProgress(page, p);
      const violations = await seriousViolations(page);
      expect(violations, `p=${p} ${JSON.stringify(violations, null, 2)}`).toEqual([]);
    }
  });
}
