import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/** Espera a que terminen las animaciones (p. ej. opacidad de Motion) antes de medir o capturar. */
export async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}

export async function seriousViolations(page: Page) {
  await settle(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}
