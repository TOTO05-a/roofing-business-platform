import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { vi } from 'vitest';
import { SessionProvider } from './session';

export interface MockResponse {
  status?: number;
  body?: unknown;
  /** Simula la falta de conexión. */
  network?: boolean;
}

export type Handler = MockResponse | ((body: unknown) => MockResponse);

/** Sustituye `fetch` por un enrutador de respuestas: `'POST /api/auth/sign-in/email'`. */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: { key: string; body: unknown }[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`;
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ key, body });
    const handler = handlers[key] ?? { status: 404, body: {} };
    const res = typeof handler === 'function' ? handler(body) : handler;
    if (res.network) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(
      new Response(res.body === undefined ? null : JSON.stringify(res.body), {
        status: res.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export const meUnauthenticated: Handler = {
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'x' } },
};

export function meOf(
  role: string,
  extra: { twoFactorEnabled?: boolean; twoFactorRequired?: boolean } = {},
) {
  return {
    status: 200,
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

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}`}</p>;
}

/** Monta una página dentro de un router en memoria y de la sesión real (con `fetch` simulado). */
export function renderPage(
  element: ReactElement,
  { path = '/', initial = path }: { path?: string; initial?: string } = {},
) {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}
