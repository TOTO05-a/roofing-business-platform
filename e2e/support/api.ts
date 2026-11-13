import type { Page, Route } from '@playwright/test';

export interface ApiReply {
  status?: number;
  body?: unknown;
  /** Simula que no hay conexión con el servidor. */
  abort?: boolean;
}
export type ApiHandler = ApiReply | ((body: unknown) => ApiReply);

export function me(
  role: 'CUSTOMER' | 'EMPLOYEE' | 'ADMIN' | 'SUPERADMIN' = 'CUSTOMER',
  extra: { twoFactorEnabled?: boolean; twoFactorRequired?: boolean } = {},
): ApiReply {
  return {
    body: {
      user: {
        id: 'u1',
        email: 'ana@example.com',
        name: 'Ana Pérez',
        role,
        twoFactorEnabled: extra.twoFactorEnabled ?? false,
      },
      twoFactorRequired: extra.twoFactorRequired ?? false,
    },
  };
}

export const unauthenticated: ApiReply = {
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión' } },
};

/**
 * Simula la API (decisión: e2e con API simulada). Cada clave es `'MÉTODO /ruta'`.
 * Lo que no esté definido responde 404; `GET /api/me` sin handler responde 401 (sin sesión).
 * Devuelve el registro de peticiones, para comprobar qué se envió.
 */
export async function mockApi(page: Page, handlers: Record<string, ApiHandler>) {
  const requests: { key: string; body: unknown }[] = [];
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;
    let body: unknown;
    try {
      body = request.postDataJSON();
    } catch {
      body = undefined;
    }
    requests.push({ key, body });
    const handler = handlers[key] ?? (key === 'GET /api/me' ? unauthenticated : undefined);
    const reply: ApiReply = handler
      ? typeof handler === 'function'
        ? handler(body)
        : handler
      : { status: 404, body: { error: { code: 'NOT_FOUND', message: 'x' } } };
    if (reply.abort) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status: reply.status ?? 200,
      contentType: 'application/json',
      body: reply.body === undefined ? '' : JSON.stringify(reply.body),
    });
  });
  return requests;
}
