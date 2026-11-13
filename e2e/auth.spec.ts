import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/a11y';
import { accountDisabled, me, mockApi, unauthenticated } from './support/api';

const APP = 'http://localhost:4173';
const PASSWORD = 'una-contraseña-larga-123';
const TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('lang', 'es'));
});

async function expectAccessible(page: Page) {
  expect(await seriousViolations(page)).toEqual([]);
}

async function fillSignIn(page: Page, password = PASSWORD) {
  await page.getByLabel('Correo electrónico').fill('ana@example.com');
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

for (const scheme of ['light', 'dark'] as const) {
  for (const route of [
    '/iniciar-sesion',
    '/recuperar',
    '/restablecer?token=tok',
    '/verificacion',
    '/invitacion#token=' + TOKEN,
  ]) {
    test(`${route.split(/[?#]/)[0]} (${scheme}) sin violaciones serious/critical`, async ({
      page,
    }) => {
      await mockApi(page, {});
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto(`${APP}${route}`);
      await page.locator('main h1').waitFor();
      await expectAccessible(page);
    });
  }
}

test('sin sesión, una ruta privada lleva al acceso y se vuelve a ella al entrar', async ({
  page,
}) => {
  let signedIn = false;
  await mockApi(page, {
    'GET /api/me': () => (signedIn ? me('EMPLOYEE') : unauthenticated),
    'POST /api/auth/sign-in/email': () => {
      signedIn = true;
      return { body: { token: 't', user: {} } };
    },
  });
  await page.goto(`${APP}/agenda`);
  await expect(page).toHaveURL(`${APP}/iniciar-sesion`);
  await fillSignIn(page);
  await expect(page).toHaveURL(`${APP}/agenda`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda de trabajos');
});

test('inicio de sesión fallido: error genérico anunciado y accesible', async ({ page }) => {
  await mockApi(page, {
    'POST /api/auth/sign-in/email': {
      status: 401,
      body: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'x' },
    },
  });
  await page.goto(`${APP}/iniciar-sesion`);
  await fillSignIn(page, 'incorrecta');
  const alert = page.getByRole('alert');
  await expect(alert).toHaveText('Correo o contraseña incorrectos.');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'English' }).click();
  await expect(alert).toHaveText('Incorrect email or password.');
});

test('demasiados intentos (429) y error de red tienen mensajes claros', async ({ page }) => {
  let mode: 'limit' | 'network' = 'limit';
  await mockApi(page, {
    'POST /api/auth/sign-in/email': () =>
      mode === 'limit' ? { status: 429, body: { message: 'x' } } : { abort: true },
  });
  await page.goto(`${APP}/iniciar-sesion`);
  await fillSignIn(page);
  await expect(page.getByRole('alert')).toContainText('Demasiados intentos');
  mode = 'network';
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('alert')).toContainText('No pudimos conectar con el servidor');
});

test('validación del formulario: foco en el primer campo inválido y objetivos de 44 px', async ({
  page,
}) => {
  await mockApi(page, {});
  await page.goto(`${APP}/iniciar-sesion`);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByLabel('Correo electrónico')).toBeFocused();
  await expect(page.getByText('Este campo es obligatorio.').first()).toBeVisible();
  await expectAccessible(page);
  for (const control of [
    page.getByLabel('Correo electrónico'),
    page.getByLabel('Contraseña'),
    page.getByRole('button', { name: 'Iniciar sesión' }),
    page.getByRole('link', { name: '¿Olvidó su contraseña?' }),
  ]) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test('cerrar sesión desde el menú de usuario', async ({ page }) => {
  let signedIn = true;
  await mockApi(page, {
    'GET /api/me': () => (signedIn ? me('CUSTOMER') : unauthenticated),
    'POST /api/auth/sign-out': () => {
      signedIn = false;
      return { body: { success: true } };
    },
  });
  await page.goto(`${APP}/`);
  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await expect(page.getByText('ana@example.com')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(`${APP}/iniciar-sesion`);
  await expect(page.getByText('Cerró sesión correctamente.')).toBeVisible();
});

test('administrador: contraseña, código TOTP y entrada a la plataforma', async ({ page }) => {
  let verified = false;
  const requests = await mockApi(page, {
    'GET /api/me': () => (verified ? me('ADMIN', { twoFactorEnabled: true }) : unauthenticated),
    'POST /api/auth/sign-in/email': { body: { twoFactorRedirect: true } },
    'POST /api/auth/two-factor/verify-totp': (body) => {
      if ((body as { code?: string }).code !== '123456') {
        return { status: 401, body: { code: 'INVALID_CODE', message: 'x' } };
      }
      verified = true;
      return { body: { token: 't' } };
    },
  });
  await page.goto(`${APP}/iniciar-sesion`);
  await fillSignIn(page);
  await expect(page).toHaveURL(`${APP}/verificacion`);
  await expect(page.getByLabel('Código de verificación')).toHaveAttribute(
    'autocomplete',
    'one-time-code',
  );
  await page.getByLabel('Código de verificación').fill('000000');
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByRole('alert')).toHaveText('El código no es correcto. Inténtelo de nuevo.');
  await expectAccessible(page);
  await page.getByLabel('Código de verificación').fill('123456');
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page).toHaveURL(`${APP}/`);
  expect(requests.filter((r) => r.key === 'POST /api/auth/two-factor/verify-totp')).toHaveLength(2);
});

test('administrador sin 2FA: alta con QR y códigos de respaldo', async ({ page }) => {
  let enabled = false;
  await mockApi(page, {
    'GET /api/me': () =>
      enabled
        ? me('SUPERADMIN', { twoFactorEnabled: true })
        : me('SUPERADMIN', { twoFactorRequired: true }),
    'POST /api/auth/two-factor/enable': {
      body: {
        totpURI: 'otpauth://totp/Roofing:ana%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Roofing',
        backupCodes: ['aaaaa-11111', 'bbbbb-22222', 'ccccc-33333', 'ddddd-44444'],
      },
    },
    'POST /api/auth/two-factor/verify-totp': () => {
      enabled = true;
      return { body: { token: 't' } };
    },
  });
  // Cualquier ruta privada lleva al alta mientras falte el 2FA.
  await page.goto(`${APP}/usuarios`);
  await expect(page).toHaveURL(`${APP}/configurar-2fa`);
  await expectAccessible(page);

  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: '1. Escanee el código QR' })).toBeFocused();
  await expect(page.getByRole('img', { name: /código QR/i })).toBeVisible();
  await expect(page.getByText('JBSWY3DPEHPK3PXP')).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel('Código de verificación').fill('123456');
  await page.getByRole('button', { name: 'Activar' }).click();
  await expect(page.getByRole('heading', { name: 'Guarde sus códigos de respaldo' })).toBeFocused();
  await expect(page.getByText('aaaaa-11111')).toBeVisible();
  await expectAccessible(page);

  const finish = page.getByRole('button', { name: 'Terminar' });
  await expect(finish).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Ya guardé mis códigos de respaldo' }).click();
  await finish.click();
  await expect(page).toHaveURL(`${APP}/`);
});

test('invitación: crea la cuenta y lleva al acceso; el token sale de la URL', async ({ page }) => {
  const requests = await mockApi(page, {
    'POST /api/invitations/accept': { status: 201, body: { user: {} } },
  });
  await page.goto(`${APP}/invitacion#token=${TOKEN}`);
  await expect(page).toHaveURL(`${APP}/invitacion`);
  await page.getByLabel('Nombre completo').fill('Ana Pérez');
  await page.getByLabel(/^Contraseña/).fill(PASSWORD);
  await page.getByLabel('Confirmar contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(`${APP}/iniciar-sesion`);
  await expect(page.getByText('Su cuenta está lista.')).toBeVisible();
  expect(requests.find((r) => r.key === 'POST /api/invitations/accept')?.body).toEqual({
    token: TOKEN,
    name: 'Ana Pérez',
    password: PASSWORD,
  });
});

for (const [code, status, text] of [
  ['INVITATION_EXPIRED', 410, 'caducó o fue anulada'],
  ['INVITATION_USED', 410, 'ya fue utilizada'],
  ['INVITATION_INVALID', 404, 'no es válida'],
] as const) {
  test(`invitación ${code}: mensaje claro y accesible`, async ({ page }) => {
    await mockApi(page, {
      'POST /api/invitations/accept': { status, body: { error: { code, message: 'x' } } },
    });
    await page.goto(`${APP}/invitacion#token=${TOKEN}`);
    await page.getByLabel('Nombre completo').fill('Ana');
    await page.getByLabel(/^Contraseña/).fill(PASSWORD);
    await page.getByLabel('Confirmar contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByRole('alert')).toContainText(text);
    await expectAccessible(page);
  });
}

test('recuperar contraseña: mensaje idéntico y restablecer con el enlace', async ({ page }) => {
  const requests = await mockApi(page, {
    'POST /api/auth/request-password-reset': { body: { status: true } },
    'POST /api/auth/reset-password': { body: { status: true } },
  });
  await page.goto(`${APP}/recuperar`);
  await page.getByLabel('Correo electrónico').fill('nadie@example.com');
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByText(/Si existe una cuenta con ese correo/)).toBeVisible();
  await expectAccessible(page);

  await page.goto(`${APP}/restablecer?token=tok123`);
  await expect(page).toHaveURL(`${APP}/restablecer`);
  await page.getByLabel('Nueva contraseña').fill(PASSWORD);
  await page.getByLabel('Confirmar contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page).toHaveURL(`${APP}/iniciar-sesion`);
  await expect(page.getByText('Contraseña actualizada.')).toBeVisible();
  expect(requests.find((r) => r.key === 'POST /api/auth/reset-password')?.body).toEqual({
    token: 'tok123',
    newPassword: PASSWORD,
  });
});

test('si la API no responde al cargar la sesión, ofrece reintentar', async ({ page }) => {
  let down = true;
  await mockApi(page, { 'GET /api/me': () => (down ? { abort: true } : me('CUSTOMER')) });
  await page.goto(`${APP}/`);
  await expect(page.getByRole('alert')).toContainText('No pudimos cargar su sesión');
  await expectAccessible(page);
  down = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inicio');
});

test('al cambiar de pantalla el foco pasa al título', async ({ page }) => {
  await mockApi(page, {});
  await page.goto();
  await page.getByRole('link', { name: '¿Olvidó su contraseña?' }).click();
  await expect(page).toHaveURL();
  await expect(page.getByRole('heading', { level: 1, name: 'Recuperar contraseña' })).toBeFocused();
});

test('cuenta desactivada (403 en /api/me): vuelve al acceso', async ({ page }) => {
  await mockApi(page, { 'GET /api/me': accountDisabled });
  await page.goto();
  await expect(page).toHaveURL();
});
