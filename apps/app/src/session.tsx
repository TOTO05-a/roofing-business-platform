import { ErrorState, Skeleton } from '@roofing/ui';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router';
import { fetchMe, signOut as apiSignOut, type SessionUser } from './api/auth';
import { ApiError } from './api/client';

export type SessionState =
  | { status: 'loading' }
  /** `signedOut`: la persona cerró sesión ella misma (no es una sesión caducada). */
  | { status: 'unauthenticated'; signedOut?: true }
  | { status: 'error' }
  | { status: 'authenticated'; user: SessionUser; twoFactorRequired: boolean };

interface SessionContextValue {
  session: SessionState;
  /** Vuelve a leer `GET /api/me`. */
  refresh: () => Promise<SessionState>;
  /** Cierra la sesión en la API y en la interfaz. Lanza si la API no responde. */
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function loadSession(signal?: AbortSignal): Promise<SessionState> {
  try {
    const me = await fetchMe(signal);
    return { status: 'authenticated', user: me.user, twoFactorRequired: me.twoFactorRequired };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    // 401 = sin sesión; 403 = cuenta desactivada. En ambos casos hay que volver al acceso.
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return { status: 'unauthenticated' };
    }
    return { status: 'error' };
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    loadSession(controller.signal).then(setSession, () => undefined);
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, []);

  const refresh = useCallback(async () => {
    const next = await loadSession();
    if (mounted.current) setSession(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setSession({ status: 'unauthenticated', signedOut: true });
  }, []);

  const value = useMemo(() => ({ session, refresh, signOut }), [session, refresh, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider');
  return ctx;
}

/** Esqueleto de carga que anuncia el estado a lectores de pantalla. */
export function SessionLoading() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-6xl space-y-4 p-6">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function SessionError() {
  const { t } = useTranslation();
  const { refresh } = useSession();
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="mx-auto max-w-xl p-6">
      <ErrorState
        title={t('app.auth.errors.session')}
        description={t('app.auth.errors.network')}
        retryLabel={t('common.retry')}
        onRetry={() => {
          setRetrying(true);
          void refresh().finally(() => setRetrying(false));
        }}
        retrying={retrying}
        live
      />
    </div>
  );
}

interface GuardProps {
  children: ReactNode;
  /** Deja pasar a quien aún debe activar el 2FA (solo la pantalla de alta). */
  allowPendingTwoFactor?: boolean;
}

/** Exige sesión: sin ella, al acceso (recordando a dónde iba); con 2FA pendiente, al alta. */
export function RequireSession({ children, allowPendingTwoFactor = false }: GuardProps) {
  const { session } = useSession();
  const location = useLocation();
  if (session.status === 'loading') return <SessionLoading />;
  if (session.status === 'error') return <SessionError />;
  if (session.status === 'unauthenticated') {
    return (
      <Navigate
        to="/iniciar-sesion"
        replace
        state={
          session.signedOut
            ? { notice: 'signedOut' }
            : { from: `${location.pathname}${location.search}` }
        }
      />
    );
  }
  if (session.twoFactorRequired && !allowPendingTwoFactor) {
    return <Navigate to="/configurar-2fa" replace />;
  }
  return children;
}
