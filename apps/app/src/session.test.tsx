import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authErrorKey } from './api/errors';
import { ApiError, NetworkError } from './api/client';
import { RequireSession } from './session';
import { meOf, meUnauthenticated, mockApi, renderPage } from './test-utils';

afterEach(() => vi.unstubAllGlobals());

describe('RequireSession', () => {
  it('sin sesión redirige al acceso', async () => {
    mockApi({ 'GET /api/me': meUnauthenticated });
    renderPage(
      <RequireSession>
        <p>privado</p>
      </RequireSession>,
    );
    expect(await screen.findByTestId('location')).toHaveTextContent('/iniciar-sesion');
    expect(screen.queryByText('privado')).toBeNull();
  });

  it('con sesión muestra el contenido', async () => {
    mockApi({ 'GET /api/me': meOf('CUSTOMER') });
    renderPage(
      <RequireSession>
        <p>privado</p>
      </RequireSession>,
    );
    expect(await screen.findByText('privado')).toBeVisible();
  });

  it('con 2FA pendiente redirige a configurarlo', async () => {
    mockApi({ 'GET /api/me': meOf('ADMIN', { twoFactorRequired: true }) });
    renderPage(
      <RequireSession>
        <p>privado</p>
      </RequireSession>,
    );
    expect(await screen.findByTestId('location')).toHaveTextContent('/configurar-2fa');
  });

  it('si la API no responde ofrece reintentar (esqueleto mientras carga)', async () => {
    mockApi({ 'GET /api/me': { network: true } });
    renderPage(
      <RequireSession>
        <p>privado</p>
      </RequireSession>,
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
});

describe('authErrorKey', () => {
  it('no distingue cuentas inexistentes de contraseñas incorrectas', () => {
    expect(authErrorKey(new ApiError(401, 'INVALID_EMAIL_OR_PASSWORD'))).toBe('invalidCredentials');
    expect(authErrorKey(new ApiError(401, null))).toBe('invalidCredentials');
  });
  it('mapea 429, red y 5xx', () => {
    expect(authErrorKey(new ApiError(429, null))).toBe('tooMany');
    expect(authErrorKey(new NetworkError())).toBe('network');
    expect(authErrorKey(new ApiError(500, 'INTERNAL_ERROR'))).toBe('server');
  });
  it('mapea invitaciones caducadas, anuladas o usadas', () => {
    expect(authErrorKey(new ApiError(410, 'INVITATION_REVOKED'))).toBe('invitationExpired');
    expect(authErrorKey(new ApiError(410, 'INVITATION_USED'))).toBe('invitationUsed');
  });
});
