import { Button, EmptyState } from '@roofing/ui';
import { Construction, SearchX, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { showcaseEnabled } from '../config';
import { findNavItem } from '../navigation';

export function HomePage() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="bienvenida" className="rounded-xl bg-surface-alt p-8 sm:p-12">
      <h2 id="bienvenida" className="font-display text-3xl font-extrabold">
        {t('app.home.welcome')}
      </h2>
      <p className="mt-3 max-w-prose text-lg text-fg-muted">{t('app.home.text')}</p>
      {showcaseEnabled && (
        <Button asChild className="mt-6">
          <Link to="/componentes">{t('app.home.viewComponents')}</Link>
        </Button>
      )}
    </section>
  );
}

export function PlaceholderPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const item = findNavItem(pathname);
  return (
    <EmptyState
      icon={<Construction className="size-7" />}
      title={item ? t(`app.nav.${item.labelKey}`) : t('app.placeholder.title')}
      description={t('app.placeholder.text')}
    />
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={<SearchX className="size-7" />}
      title={t('app.notFound.title')}
      description={t('app.notFound.text')}
      action={
        <Button asChild>
          <Link to="/">{t('app.notFound.back')}</Link>
        </Button>
      }
    />
  );
}

/** Página 403 de interfaz; la autorización real la aplica la API. */
export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={<ShieldAlert className="size-7" />}
      title={t('app.forbidden.title')}
      description={t('app.forbidden.text')}
      action={
        <Button asChild>
          <Link to="/">{t('app.forbidden.back')}</Link>
        </Button>
      }
    />
  );
}
