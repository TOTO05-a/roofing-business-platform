import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppShell } from './components/AppShell';
import { showcaseEnabled } from './config';
import { canAccess, navItems, type NavItem } from './navigation';
import { ForbiddenPage, NotFoundPage } from './pages/Basic';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { InvitationPage } from './pages/auth/InvitationPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { SetupTwoFactorPage } from './pages/auth/SetupTwoFactorPage';
import { SignInPage } from './pages/auth/SignInPage';
import { VerifyTwoFactorPage } from './pages/auth/VerifyTwoFactorPage';
import { AuthLayout } from './pages/auth/shared';
import { AgendaPage } from './pages/crm/AgendaPage';
import {
  CustomerDetailPage,
  CustomersPage,
  PropertiesPage,
  PropertyDetailPage,
} from './pages/crm/CustomersPages';
import { InspectionDetailPage, InspectionsPage } from './pages/crm/InspectionPages';
import { LeadDetailPage } from './pages/crm/LeadDetailPage';
import { LeadsPage } from './pages/crm/LeadsPage';
import { EmployeesPage, UsersPage } from './pages/sim/AdminPages';
import { CatalogPage } from './pages/sim/CatalogPage';
import { DashboardPage } from './pages/sim/DashboardPage';
import { InvoicesPage } from './pages/sim/InvoicesPage';
import { ProjectDetailPage, ProjectsPage } from './pages/sim/ProjectsPages';
import { QuoteDetailPage, QuotesPage } from './pages/sim/QuotesPages';
import { useRole } from './role';
import { RequireSession, SessionLoading } from './session';

/** Guard de interfaz por rol (`item.roles`). La autorización real irá en la API. */
function RequireRole({ item, children }: { item: Pick<NavItem, 'roles'>; children: ReactNode }) {
  const { role } = useRole();
  return canAccess(role, item) ? children : <ForbiddenPage />;
}

/** Ruta del CRM protegida por el rol de su elemento de navegación (la API autoriza de verdad). */
function crmRoute(id: string, path: string, element: ReactNode) {
  const item = navItems.find((i) => i.id === id);
  if (!item) throw new Error(`Falta el elemento de navegación ${id}`);
  return { path, element: <RequireRole item={item}>{element}</RequireRole> };
}

const crmRoutes = [
  crmRoute('leads', 'leads', <LeadsPage />),
  crmRoute('leads', 'leads/:id', <LeadDetailPage />),
  crmRoute('customers', 'clientes', <CustomersPage />),
  crmRoute('customers', 'clientes/:id', <CustomerDetailPage />),
  crmRoute('properties', 'propiedades', <PropertiesPage />),
  crmRoute('properties', 'propiedades/:id', <PropertyDetailPage />),
  crmRoute('schedule', 'agenda', <AgendaPage />),
  crmRoute('appointments', 'citas', <AgendaPage />),
  crmRoute('inspections', 'inspecciones', <InspectionsPage />),
  crmRoute('inspections', 'inspecciones/:id', <InspectionDetailPage />),
  // Demo simulada (N17): catálogo, presupuestos, proyectos, facturas y administración.
  crmRoute('materials', 'materiales', <CatalogPage />),
  crmRoute('quotes', 'cotizaciones', <QuotesPage />),
  crmRoute('quotes', 'cotizaciones/:id', <QuoteDetailPage />),
  crmRoute('projects', 'proyectos', <ProjectsPage />),
  crmRoute('projects', 'proyectos/:id', <ProjectDetailPage />),
  crmRoute('invoices', 'facturas', <InvoicesPage />),
  crmRoute('employees', 'empleados', <EmployeesPage />),
  crmRoute('users', 'usuarios', <UsersPage />),
];

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
      { index: true, element: <DashboardPage /> },
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
      ...crmRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
