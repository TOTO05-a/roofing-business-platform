import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/a11y';

const WEB = 'http://localhost:4321';

const texts = {
  es: { required: 'Este campo es obligatorio.', unavailable: 'no está disponible ahora' },
  en: { required: 'This field is required.', unavailable: 'not available right now' },
} as const;

async function openForm(page: Page, locale: 'es' | 'en') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${WEB}/${locale}/#contacto`);
  const form = page.locator('form[data-contact-form]');
  await form.scrollIntoViewIfNeeded();
  return form;
}

for (const locale of ['es', 'en'] as const) {
  test(`formulario de contacto (${locale}): errores accesibles y foco en el primer campo inválido`, async ({
    page,
  }) => {
    const form = await openForm(page, locale);
    await form.getByRole('button', { name: /enviar|send/i }).click();
    await expect(form.getByText(texts[locale].required).first()).toBeVisible();
    await expect(form.locator('input[name="name"]')).toBeFocused();
    await expect(form.locator('input[name="name"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByRole('alert')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
}

test('formulario de contacto: el campo trampa no se ve ni se puede enfocar con Tab', async ({
  page,
}) => {
  const form = await openForm(page, 'es');
  const trap = form.locator('[data-form-trap]');
  await expect(trap).toHaveAttribute('aria-hidden', 'true');
  const input = trap.locator('input');
  await expect(input).toHaveAttribute('tabindex', '-1');
  await expect(input).toHaveAttribute('autocomplete', 'off');
  const box = await input.boundingBox();
  expect(box === null || box.x + box.width < 0).toBe(true);
});

test('formulario de contacto: sin URL de la API en el build muestra un error claro', async ({
  page,
}) => {
  const form = await openForm(page, 'es');
  const configured = (await form.getAttribute('data-api-url')) !== '';
  test.skip(configured, 'Este build trae PUBLIC_API_URL: el envío real no se prueba aquí.');
  await form.locator('input[name="name"]').fill('Ana Prueba');
  await form.locator('input[name="email"]').fill('ana@example.com');
  await form.locator('input[name="consent"]').check();
  await form.getByRole('button', { name: /enviar/i }).click();
  await expect(form.getByRole('alert')).toContainText(texts.es.unavailable);
});

test('formulario de contacto: con la API simulada envía el lead y confirma', async ({ page }) => {
  const form = await openForm(page, 'en');
  const apiUrl = await form.getAttribute('data-api-url');
  test.skip(!apiUrl, 'Requiere un build con PUBLIC_API_URL.');
  let sent: Record<string, unknown> | null = null;
  await page.route(`${apiUrl}/api/public/form-token`, (route) =>
    route.fulfill({ json: { token: 'token-de-prueba' } }),
  );
  await page.route(`${apiUrl}/api/public/leads`, async (route) => {
    sent = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, json: { ok: true } });
  });
  await form.locator('input[name="name"]').fill('Ana Maria Prueba');
  await form.locator('input[name="email"]').fill('ana@example.com');
  await form.locator('input[name="consent"]').check();
  await form.getByRole('button', { name: /send/i }).click();
  await expect(form.getByRole('status')).toContainText('Request sent');
  expect(sent).toMatchObject({ firstName: 'Ana', lastName: 'Maria Prueba', website_url: '' });
});
