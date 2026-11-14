import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  LanguageSwitcher,
  Logo,
  Toaster,
  ThemeToggle,
  useTheme,
} from '@roofing/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import type { AuthErrorKey } from '../../api/errors';
import type { SessionState } from '../../session';

export type Notice = 'accountCreated' | 'passwordReset' | 'signedOut' | 'twoFactorExpired';

export interface AuthLocationState {
  from?: string;
  notice?: Notice;
}

/** Solo se vuelve a rutas internas: evita redirecciones abiertas (`//otro.sitio`, `https:`). */
export function safeFrom(from: unknown): string {
  return typeof from === 'string' && /^\/(?![\\/])/.test(from) ? from : '/';
}

export function readState(state: unknown): AuthLocationState {
  return typeof state === 'object' && state !== null ? (state as AuthLocationState) : {};
}

/** A dónde va quien ya tiene sesión al abrir una pantalla de acceso. */
export function sessionHome(session: SessionState, from: string): string | null {
  if (session.status !== 'authenticated') return null;
  return session.twoFactorRequired ? '/configurar-2fa' : from;
}

export const linkClass =
  'inline-flex min-h-11 items-center font-semibold text-link underline underline-offset-4 hover:text-link-hover focus-visible:outline-3 focus-visible:outline-ring rounded-sm';

/** Marco de las pantallas de acceso: cabecera con idioma y tema, y una tarjeta centrada. */
export function AuthLayout() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useTheme();
  const lang = (i18n.resolvedLanguage ?? 'es').split('-')[0] ?? 'es';
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <a
        href="#contenido"
        className="fixed start-3 top-3 z-[60] -translate-y-20 rounded-md bg-primary px-4 py-3 font-display font-semibold text-primary-fg focus:translate-y-0"
      >
        {t('common.skipToContent')}
      </a>
      <header className="flex h-16 items-center justify-between gap-2 border-b border-border px-3 sm:px-6">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-md"
          aria-label={t('brand.name')}
        >
          <Logo variant="compact" />
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher
            options={[
              { code: 'es', name: t('common.spanish') },
              { code: 'en', name: t('common.english') },
            ]}
            value={lang}
            onChange={(code) => void i18n.changeLanguage(code)}
            label={t('common.language')}
          />
          <ThemeToggle
            value={theme}
            onChange={setTheme}
            labels={{
              label: t('common.theme'),
              light: t('common.themeLight'),
              dark: t('common.themeDark'),
              system: t('common.themeSystem'),
            }}
          />
        </div>
      </header>
      <main
        id="contenido"
        tabIndex={-1}
        className="grid flex-1 place-items-center p-4 outline-none sm:p-6"
      >
        <Outlet />
      </main>
      <Toaster theme={theme} label={t('common.notifications')} closeLabel={t('common.close')} />
    </div>
  );
}

interface AuthCardProps {
  title: string;
  intro?: string | undefined;
  children: ReactNode;
}

/** Solo la primera pantalla que se pinta no roba el foco (la carga inicial ya lo tiene). */
let firstCard = true;

export function AuthCard({ title, intro, children }: AuthCardProps) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${title} | ${t('brand.name')}`;
  }, [title, t]);
  // WCAG 2.4.3: al cambiar de pantalla (o de estado con otro título), el foco va al título.
  useEffect(() => {
    if (firstCard) {
      firstCard = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
  }, [title]);
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="gap-2 p-6 pb-2 sm:p-8 sm:pb-3">
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-display text-2xl font-extrabold outline-none"
        >
          {title}
        </h1>
        {intro ? <CardDescription>{intro}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-5 p-6 pt-3 sm:p-8 sm:pt-3">{children}</CardContent>
    </Card>
  );
}

/**
 * Aviso informativo que SÍ se anuncia: la región viva existe vacía y el texto se inserta
 * después de montarse (si el texto ya estuviera al montar, muchos lectores no lo leerían).
 */
export function LiveNotice({
  variant = 'success',
  children,
}: {
  variant?: 'success' | 'warning';
  children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(true), 150);
    return () => window.clearTimeout(id);
  }, []);
  return <div role="status">{shown ? <Alert variant={variant}>{children}</Alert> : null}</div>;
}

/** Error de formulario: se anuncia a los lectores de pantalla al aparecer. */
export function FormError({ errorKey }: { errorKey: AuthErrorKey | null }) {
  const { t } = useTranslation();
  if (!errorKey) return null;
  return (
    <Alert variant="danger" live>
      {t(`app.auth.errors.${errorKey}`)}
    </Alert>
  );
}
