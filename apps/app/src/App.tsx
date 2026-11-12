import { useEffect, useState } from 'react';
import { healthResponseSchema } from '@roofing/shared';

type Status = { kind: 'loading' } | { kind: 'ok' } | { kind: 'error'; message: string };

export function App() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then((res) => res.json())
      .then((data: unknown) => {
        const parsed = healthResponseSchema.safeParse(data);
        setStatus(
          parsed.success ? { kind: 'ok' } : { kind: 'error', message: 'Respuesta inesperada' },
        );
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Error' });
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>Plataforma</h1>
      <p role="status">
        Estado de la API: {status.kind === 'loading' && 'comprobando…'}
        {status.kind === 'ok' && 'operativa'}
        {status.kind === 'error' && `sin conexión (${status.message})`}
      </p>
    </main>
  );
}
