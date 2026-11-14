import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

export const WEB = 'http://localhost:4321';
export const APP = 'http://localhost:4173';

/** Textos por idioma. `announce` es el anuncio tras elegir cuatro aguas y pizarra. */
export const locales = [
  {
    code: 'es',
    gable: 'Dos aguas',
    hip: 'Cuatro aguas',
    slate: 'Pizarra',
    slateColor: 'Gris pizarra',
    announce: 'Techo, cuatro aguas: Pizarra, color Gris pizarra',
  },
  {
    code: 'en',
    gable: 'Gable',
    hip: 'Hip',
    slate: 'Slate',
    slateColor: 'Slate gray',
    announce: 'Roof, hip: Slate, color Slate gray',
  },
] as const;

/** Espera a que terminen las animaciones (CSS, Web Animations) antes de medir o capturar. */
export async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}

/** Lleva el visualizador a la vista y espera a que la isla de Astro se hidrate. */
export async function openVisualizer(page: Page) {
  const section = page.locator('#techos');
  await section.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  return section;
}

export async function seriousViolations(page: Page) {
  await settle(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}
