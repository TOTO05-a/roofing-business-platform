import { Skeleton } from '@roofing/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { createBrowserRouter } from 'react-router';
import { AppShell } from './components/AppShell';
import { showcaseEnabled } from './config';
import { canAccess, navItems, placeholderItems, type NavItem } from './navigation';
import { ForbiddenPage, HomePage, NotFoundPage, PlaceholderPage } from './pages/Basic';
import { useRole } from './role';

/** Guard de interfaz por rol (`item.roles`). La autorización real irá en la API. */
function RequireRole({ item, children }: { item: Pick<NavItem, 'roles'>; children: ReactNode }) {
  const { role } = useRole();
  return canAccess(role, item) ? children : <ForbiddenPage />;
}

/** Marcador de carga inicial: anuncia el estado y no depende de la hidratación. */
function HydrateFallback() {
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

const showcaseItem = navItems.find((item) => item.id === 'components');

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    hydrateFallbackElement: <HydrateFallback />,
    children: [
      { index: true, element: <HomePage /> },
      ...(showcaseEnabled && showcaseItem
        ? [
            {
              path: 'componentes',
              lazy: async () => {
                const { ShowcasePage } = await import('./pages/Showcase');
                return {
                  element: (
                    <RequireRole item={showcaseItem}>
                      <ShowcasePage />
                    </RequireRole>
                  ),
                };
              },
            },
          ]
        : []),
      ...placeholderItems.map((item) => ({
        path: item.to.slice(1),
        element: (
          <RequireRole item={item}>
            <PlaceholderPage />
          </RequireRole>
        ),
      })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
