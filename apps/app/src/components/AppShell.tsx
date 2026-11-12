import {
  Avatar,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LanguageSwitcher,
  Logo,
  ThemeToggle,
  Toaster,
  toast,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useTheme,
} from '@roofing/ui';
import { ChevronsLeft, ChevronsRight, Menu } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { canAccess, findNavItem, navForRole, roles, type NavItem } from '../navigation';
import { isDev } from '../config';
import { authErrorKey } from '../api/errors';
import { useRole } from '../role';
import { useSession } from '../session';

const COLLAPSE_KEY = 'sidebar-collapsed';

function useCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignorar */
      }
      return !c;
    });
  return [collapsed, toggle];
}

function NavList({
  items,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const label = t(`app.nav.${item.labelKey}`);
        const link = (
          <NavLink
            to={item.to}
            end
            onClick={onNavigate}
            aria-label={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-md px-3 font-display font-semibold transition-colors duration-[var(--duration-fast)]',
                isActive
                  ? 'bg-primary text-primary-fg'
                  : 'text-on-brand-muted hover:bg-white/10 hover:text-on-brand',
                collapsed && 'justify-center px-0',
              )
            }
          >
            <item.icon aria-hidden="true" className="size-5 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        );
        return (
          <li key={item.id}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RolePreview() {
  const { t } = useTranslation();
  const { role, setRole } = useRole();
  if (!isDev) return null;
  return (
    <div className="mt-auto border-t border-white/15 p-3">
      <label
        className="mb-1 block text-xs font-semibold text-on-brand-muted"
        htmlFor="role-preview"
      >
        {t('app.roles.devLabel')}
      </label>
      <select
        id="role-preview"
        value={role}
        onChange={(e) => setRole(e.target.value as (typeof roles)[number])}
        className="min-h-11 w-full rounded-md border border-white/30 bg-surface-brand px-2 text-on-brand"
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {t(`app.roles.${r}`)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AppShell() {
  const { t, i18n } = useTranslation();
  const { role } = useRole();
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useTheme();
  const [collapsed, toggleCollapsed] = useCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);

  const items = navForRole(role);
  const current = findNavItem(location.pathname);
  const title = !current
    ? t('app.notFound.title')
    : canAccess(role, current)
      ? t(`app.nav.${current.labelKey}`)
      : t('app.forbidden.title');
  const lang = (i18n.resolvedLanguage ?? 'es').split('-')[0] ?? 'es';

  // Título del documento: se actualiza también al cambiar de idioma.
  useEffect(() => {
    document.title = `${title} | ${t('brand.name')}`;
  }, [title, t]);

  // Foco al contenido y scroll arriba solo al cambiar de ruta (lectores de pantalla y teclado);
  // cambiar de idioma no debe mover el foco ni la posición.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const user = session.status === 'authenticated' ? session.user : null;
  const initials = (user?.name ?? '')
    .split(/s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
  const handleSignOut = async () => {
    try {
      await signOut();
      void navigate('/iniciar-sesion', { replace: true, state: { notice: 'signedOut' } });
    } catch (error) {
      toast.error(t(`app.auth.errors.${authErrorKey(error)}`));
    }
  };

  const languageOptions = [
    { code: 'es', name: t('common.spanish') },
    { code: 'en', name: t('common.english') },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <a
        href="#contenido"
        className="fixed start-3 top-3 z-[60] -translate-y-20 rounded-md bg-primary px-4 py-3 font-display font-semibold text-primary-fg focus:translate-y-0"
      >
        {t('common.skipToContent')}
      </a>

      {/* Barra lateral de escritorio */}
      <aside
        className={cn(
          'on-brand fixed inset-y-0 start-0 z-30 hidden flex-col bg-surface-brand text-on-brand transition-[width] duration-[var(--duration-slow)] ease-emphasized motion-reduce:transition-none lg:flex',
          collapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        <div className={cn('flex h-16 items-center px-4', collapsed && 'justify-center px-0')}>
          <Logo variant={collapsed ? 'icon' : 'compact'} />
        </div>
        <nav aria-label={t('app.nav.label')} className="flex-1 overflow-y-auto px-3 py-2">
          <NavList items={items} collapsed={collapsed} />
        </nav>
        {!collapsed && <RolePreview />}
        <div className="border-t border-white/15 p-3">
          <Button
            variant="ghost"
            size="icon"
            className={cn('text-on-brand hover:bg-white/10', collapsed ? 'mx-auto' : 'ms-auto')}
            onClick={toggleCollapsed}
            aria-label={collapsed ? t('app.shell.expand') : t('app.shell.collapse')}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronsRight aria-hidden="true" className="size-5 rtl:rotate-180" />
            ) : (
              <ChevronsLeft aria-hidden="true" className="size-5 rtl:rotate-180" />
            )}
          </Button>
        </div>
      </aside>

      {/* Cajón móvil */}
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent
          side="start"
          closeLabel={t('app.shell.closeMenu')}
          className="on-brand flex flex-col bg-surface-brand text-on-brand"
        >
          <DialogTitle className="flex h-16 items-center px-4">
            <Logo variant="compact" />
          </DialogTitle>
          <DialogDescription className="sr-only">{t('app.nav.label')}</DialogDescription>
          <nav aria-label={t('app.nav.label')} className="flex-1 px-3 py-2">
            <NavList items={items} collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </nav>
          <RolePreview />
        </DialogContent>
      </Dialog>

      <div
        className={cn(
          'min-h-dvh transition-[padding] duration-[var(--duration-slow)] ease-emphasized motion-reduce:transition-none',
          collapsed ? 'lg:ps-[4.5rem]' : 'lg:ps-64',
        )}
      >
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-bg/95 px-3 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label={t('app.shell.openMenu')}
          >
            <Menu aria-hidden="true" className="size-6" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate font-display text-xl font-extrabold sm:text-2xl">
            {title}
          </h1>
          <LanguageSwitcher
            options={languageOptions}
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
          <DropdownMenu>
            <DropdownMenuTrigger className="grid size-11 place-items-center rounded-full">
              <span className="sr-only">{t('app.shell.userMenu')}</span>
              <Avatar fallback={initials || '··'} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <span className="block">{user?.name}</span>
                <span className="block text-sm font-normal text-fg-muted">{user?.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>{t('app.shell.profile')}</DropdownMenuItem>
              <DropdownMenuItem disabled>{t('app.shell.account')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handleSignOut()}>
                {t('app.shell.signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main
          id="contenido"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto max-w-6xl p-4 outline-none sm:p-6 lg:p-8"
        >
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      <Toaster theme={theme} label={t('common.notifications')} closeLabel={t('common.close')} />
    </TooltipProvider>
  );
}
