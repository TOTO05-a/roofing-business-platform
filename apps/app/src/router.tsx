import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppShell } from './components/AppShell';
import { showcaseEnabled } from './config';
import { canAccess, navItems, placeholderItems, type NavItem } from './navigation';
import { ForbiddenPage, HomePage, NotFoundPage, PlaceholderPage } from './pages/Basic';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { InvitationPage } from './pages/auth/InvitationPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { SetupTwoFactorPage } from './pages/auth/SetupTwoFactorPage';
import { SignInPage } from './pages/auth/SignInPage';
import { VerifyTwoFactorPage } from './pages/auth/VerifyTwoFactorPage';
import { AuthLayout } from './pages/auth/shared';
import { useRole } from './role';
import { RequireSession, SessionLoading } from './session';

/** Guard de interfaz por rol (`item.roles`). La autorización real irá en la API. */
function RequireRole({ item, children }: { item: Pick<NavItem, 'roles'>; children: ReactNode }) {
  const { role } = useRole();
  return canAccess(role, item) ? children : <ForbiddenPage />;
}

const showcaseItem = navItems.find((item) => item.id === 'components');

export const router = createBrowserRouter([
  {
    // Pantallas de acceso: públicas, salvo el alta de 2FA que exige sesión.
    element: <AuthLayout />,
    hydrateFallbackElement: <SessionLoading />,
    children: [
      { path: 'iniciar-sesion', element: <SignInPage /> },
      { path: 'invitacion', element: <InvitationPage /> },
      { path: 'recuperar', element: <ForgotPasswordPage /> },
      { path: 'restablecer', element: <ResetPasswordPage /> },
      { path: 'verificacion', element: <VerifyTwoFactorPage /> },
      {
        path: 'configurar-2fa',
        element: (
          <RequireSession allowPendingTwoFactor>
            <SetupTwoFactorPage />
          </RequireSession>
        ),
      },
    ],
  },
  {
    element: (
      <RequireSession>
        <AppShell />
      </RequireSession>
    ),
    hydrateFallbackElement: <SessionLoading />,
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
