import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { meOf, meUnauthenticated, mockApi, renderPage } from '../../test-utils';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { InvitationPage } from './InvitationPage';
import { ResetPasswordPage } from './ResetPasswordPage';
import { SetupTwoFactorPage } from './SetupTwoFactorPage';
import { SignInPage } from './SignInPage';
import { safeFrom } from './shared';
import { VerifyTwoFactorPage } from './VerifyTwoFactorPage';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

const LONG_PASSWORD = 'una-contraseña-larga-123';
const ME = 'GET /api/me';
const SIGN_IN = 'POST /api/auth/sign-in/email';

describe('SignInPage', () => {
  it('usa los atributos de autocompletado correctos', async () => {
    mockApi({ [ME]: meUnauthenticated });
    renderPage(<SignInPage />);
    const email = await screen.findByLabelText(/correo electrónico/i);
    expect(email).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText(/^contraseña/i)).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
  });

  it('valida los campos vacíos sin llamar a la API', async () => {
    const { calls } = mockApi({ [ME]: meUnauthenticated });
    renderPage(<SignInPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findAllByText('Este campo es obligatorio.')).toHaveLength(2);
    expect(calls.some((c) => c.key === SIGN_IN)).toBe(false);
  });

  it('muestra un error genérico (aria-live) si las credenciales fallan', async () => {
    mockApi({
      [ME]: meUnauthenticated,
      [SIGN_IN]: { status: 401, body: { code: 'INVALID_EMAIL_OR_PASSWORD' } },
    });
    renderPage(<SignInPage />);
    await userEvent.type(await screen.findByLabelText(/correo electrónico/i), 'ana@example.com');
    await userEvent.type(screen.getByLabelText(/^contraseña/i), 'incorrecta');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Correo o contraseña incorrectos.');
  });

  it('explica el límite de intentos (429)', async () => {
    mockApi({ [ME]: meUnauthenticated, [SIGN_IN]: { status: 429, body: { message: 'x' } } });
    renderPage(<SignInPage />);
    await userEvent.type(await screen.findByLabelText(/correo electrónico/i), 'ana@example.com');
    await userEvent.type(screen.getByLabelText(/^contraseña/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos');
  });

  it('explica los errores de red', async () => {
    mockApi({ [ME]: meUnauthenticated, [SIGN_IN]: { network: true } });
    renderPage(<SignInPage />);
    await userEvent.type(await screen.findByLabelText(/correo electrónico/i), 'ana@example.com');
    await userEvent.type(screen.getByLabelText(/^contraseña/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectar');
  });

  it('con 2FA activo pasa a la verificación del código', async () => {
    mockApi({
      [ME]: meUnauthenticated,
      [SIGN_IN]: { body: { twoFactorRedirect: true } },
    });
    renderPage(<SignInPage />);
    await userEvent.type(await screen.findByLabelText(/correo electrónico/i), 'ana@example.com');
    await userEvent.type(screen.getByLabelText(/^contraseña/i), LONG_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/verificacion'));
  });

  it('con sesión válida vuelve a la ruta de origen', async () => {
    let signedIn = false;
    mockApi({
      [ME]: () => (signedIn ? meOf('CUSTOMER') : { status: 401, body: {} }),
      [SIGN_IN]: () => {
        signedIn = true;
        return { body: { token: 't' } };
      },
    });
    renderPage(<SignInPage />, {
      path: '/iniciar-sesion',
      initial: { pathname: '/iniciar-sesion', state: { from: '/agenda' } },
    });
    await userEvent.type(await screen.findByLabelText(/correo electrónico/i), 'ana@example.com');
    await userEvent.type(screen.getByLabelText(/^contraseña/i), LONG_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/agenda'));
  });
});

describe('safeFrom', () => {
  it.each([
    '//evil.com',
    'https://evil.com',
    '/\\evil.com',
    '/\\/evil.com',
    'evil',
    '',
    undefined,
    42,
  ])('rechaza %s', (value) => {
    expect(safeFrom(value)).toBe('/');
  });
  it('acepta rutas internas', () => {
    expect(safeFrom('/agenda')).toBe('/agenda');
    expect(safeFrom('/clientes?x=1')).toBe('/clientes?x=1');
  });
});

describe('InvitationPage', () => {
  it('un token de longitud inválida se trata como enlace incompleto', () => {
    window.history.replaceState(null, '', '/invitacion#token=corto');
    mockApi({});
    renderPage(<InvitationPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('incompleto');
  });

  it('VALIDATION_ERROR se muestra como invitación no válida', async () => {
    window.history.replaceState(null, '', '/invitacion#token=abcdefghijklmnopqrstuvwxyz');
    mockApi({
      'POST /api/invitations/accept': {
        status: 400,
        body: { error: { code: 'VALIDATION_ERROR', message: 'x' } },
      },
    });
    renderPage(<InvitationPage />);
    await userEvent.type(screen.getByLabelText(/nombre completo/i), 'Ana');
    const [password, confirm] = screen.getAllByLabelText(/contraseña/i);
    await userEvent.type(password!, LONG_PASSWORD);
    await userEvent.type(confirm!, LONG_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no es válida');
  });

  it('lee el token del fragmento, lo quita de la URL y lo envía a la API', async () => {
    window.history.replaceState(null, '', '/invitacion#token=abcdefghijklmnopqrstuvwxyz');
    const { calls } = mockApi({
      'POST /api/invitations/accept': { status: 201, body: { user: {} } },
    });
    renderPage(<InvitationPage />);
    expect(window.location.hash).toBe('');
    await userEvent.type(screen.getByLabelText(/nombre completo/i), 'Ana Pérez');
    const [password, confirm] = screen.getAllByLabelText(/contraseña/i);
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    await userEvent.type(password!, LONG_PASSWORD);
    await userEvent.type(confirm!, LONG_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/iniciar-sesion'),
    );
    expect(calls.at(-1)?.body).toEqual({
      token: 'abcdefghijklmnopqrstuvwxyz',
      name: 'Ana Pérez',
      password: LONG_PASSWORD,
    });
  });

  it('valida longitud de la contraseña y que coincidan', async () => {
    window.history.replaceState(null, '', '/invitacion#token=abcdefghijklmnopqrstuvwxyz');
    mockApi({});
    renderPage(<InvitationPage />);
    await userEvent.type(screen.getByLabelText(/nombre completo/i), 'Ana');
    const [password, confirm] = screen.getAllByLabelText(/contraseña/i);
    await userEvent.type(password!, 'corta');
    await userEvent.type(confirm!, 'otra');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(
      await screen.findByText('La contraseña debe tener al menos 12 caracteres.'),
    ).toBeVisible();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeVisible();
  });

  it('avisa si la invitación caducó o ya se usó', async () => {
    window.history.replaceState(null, '', '/invitacion#token=abcdefghijklmnopqrstuvwxyz');
    mockApi({
      'POST /api/invitations/accept': {
        status: 410,
        body: { error: { code: 'INVITATION_EXPIRED', message: 'x' } },
      },
    });
    renderPage(<InvitationPage />);
    await userEvent.type(screen.getByLabelText(/nombre completo/i), 'Ana');
    const [password, confirm] = screen.getAllByLabelText(/contraseña/i);
    await userEvent.type(password!, LONG_PASSWORD);
    await userEvent.type(confirm!, LONG_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('caducó o fue anulada');
    expect(screen.getByRole('link', { name: 'Volver a iniciar sesión' })).toBeVisible();
  });

  it('sin token muestra un aviso en lugar del formulario', () => {
    mockApi({});
    renderPage(<InvitationPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('incompleto');
    expect(screen.queryByRole('button', { name: 'Crear cuenta' })).toBeNull();
  });
});

describe('recuperar y restablecer contraseña', () => {
  it('responde igual exista o no la cuenta', async () => {
    const { calls } = mockApi({
      'POST /api/auth/request-password-reset': { body: { status: true } },
    });
    renderPage(<ForgotPasswordPage />);
    await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'nadie@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await screen.findByText(/Si existe una cuenta con ese correo/)).toBeVisible();
    expect(calls.find((c) => c.key.startsWith('POST'))?.body).toMatchObject({
      email: 'nadie@example.com',
    });
  });

  it('restablece con el token de la URL y lo quita de la barra de direcciones', async () => {
    window.history.replaceState(null, '', '/restablecer?token=tok123');
    const { calls } = mockApi({ 'POST /api/auth/reset-password': { body: { status: true } } });
    renderPage(<ResetPasswordPage />);
    expect(window.location.search).toBe('');
    const [password, confirm] = screen.getAllByLabelText(/contraseña/i);
    await userEvent.type(password!, LONG_PASSWORD);
    await userEvent.type(confirm!, LONG_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/iniciar-sesion'),
    );
    expect(calls.find((c) => c.key.startsWith('POST'))?.body).toEqual({
      token: 'tok123',
      newPassword: LONG_PASSWORD,
    });
  });

  it('enlace inválido (?error=) o sin token', () => {
    window.history.replaceState(null, '', '/restablecer?error=INVALID_TOKEN');
    mockApi({});
    renderPage(<ResetPasswordPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('no es válido o ya caducó');
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeVisible();
  });
});

describe('VerifyTwoFactorPage', () => {
  it('rechaza un código incorrecto y permite usar uno de respaldo', async () => {
    const { calls } = mockApi({
      [ME]: meUnauthenticated,
      'POST /api/auth/two-factor/verify-totp': { status: 401, body: { code: 'INVALID_CODE' } },
      'POST /api/auth/two-factor/verify-backup-code': {
        status: 401,
        body: { code: 'INVALID_BACKUP_CODE' },
      },
    });
    renderPage(<VerifyTwoFactorPage />);
    const code = await screen.findByLabelText(/código de verificación/i);
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    await userEvent.type(code, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByText('Escriba los 6 dígitos del código.')).toBeVisible();
    await userEvent.type(code, '3456');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El código no es correcto');
    expect(calls.at(-1)?.body).toEqual({ code: '123456' });

    await userEvent.click(screen.getByRole('button', { name: 'Usar un código de respaldo' }));
    await userEvent.type(screen.getByLabelText(/código de respaldo/i), 'abcde-12345');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El código no es correcto');
  });

  it.each([
    ['INVALID_TWO_FACTOR_COOKIE', 401],
    ['TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE', 400],
  ])('%s lleva a iniciar sesión de nuevo', async (code, status) => {
    mockApi({
      [ME]: meUnauthenticated,
      'POST /api/auth/two-factor/verify-totp': { status, body: { code, message: 'x' } },
    });
    renderPage(<VerifyTwoFactorPage />);
    await userEvent.type(await screen.findByLabelText(/código de verificación/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/iniciar-sesion'));
  });
});

describe('SetupTwoFactorPage', () => {
  it('recorre contraseña, QR con código y códigos de respaldo', async () => {
    mockApi({
      [ME]: meOf('ADMIN', { twoFactorRequired: true }),
      'POST /api/auth/two-factor/enable': {
        body: {
          totpURI:
            'otpauth://totp/Roofing:ana%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Roofing',
          backupCodes: ['aaaaa-11111', 'bbbbb-22222'],
        },
      },
      'POST /api/auth/two-factor/verify-totp': { body: { token: 't' } },
    });
    renderPage(<SetupTwoFactorPage />, { path: '/configurar-2fa' });
    await userEvent.type(await screen.findByLabelText(/^contraseña/i), LONG_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByRole('img', { name: /código qr/i })).toBeVisible();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeVisible();
    await userEvent.type(screen.getByLabelText(/código de verificación/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Activar' }));

    expect(await screen.findByText('aaaaa-11111')).toBeVisible();
    const finish = screen.getByRole('button', { name: 'Terminar' });
    expect(finish).toBeDisabled(); // hasta confirmar que guardó los códigos
    await userEvent.click(screen.getByRole('checkbox', { name: /ya guardé/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Terminar' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  });

  it('muestra el error si la contraseña no es correcta', async () => {
    mockApi({
      [ME]: meOf('ADMIN', { twoFactorRequired: true }),
      'POST /api/auth/two-factor/enable': { status: 400, body: { code: 'INVALID_PASSWORD' } },
    });
    renderPage(<SetupTwoFactorPage />);
    await userEvent.type(await screen.findByLabelText(/^contraseña/i), 'mala');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña no es correcta.');
  });
});
