/** Error de la API: `status` HTTP y `code` estable (p. ej. `INVITATION_EXPIRED`). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
  ) {
    super(code ?? `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

/** No hubo respuesta: sin conexión, servidor caído, etc. */
export class NetworkError extends Error {
  constructor() {
    super('Network error');
    this.name = 'NetworkError';
  }
}

function extractCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  // Better Auth: { code, message }. Rutas propias: { error: { code, message } }.
  if ('code' in body && typeof body.code === 'string') return body.code;
  if ('error' in body && typeof body.error === 'object' && body.error !== null) {
    const { error } = body;
    if ('code' in error && typeof error.code === 'string') return error.code;
  }
  return null;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Llama a la API en el mismo origen (proxy), con la cookie de sesión.
 * Los POST llevan siempre cuerpo JSON: la API exige `Content-Length`.
 */
export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  };
  if (options.signal) init.signal = options.signal;
  if (method === 'POST') {
    init.headers = { ...init.headers, 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body ?? {});
  }

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new NetworkError();
  }

  const text = await response.text().catch(() => '');
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!response.ok) throw new ApiError(response.status, extractCode(parsed));
  return parsed as T;
}
