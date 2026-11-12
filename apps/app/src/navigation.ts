import type { Dictionary } from '@roofing/shared/i18n';
import {
  CalendarDays,
  ClipboardList,
  FileText,
  FolderKanban,
  HardHat,
  Home,
  LayoutGrid,
  LifeBuoy,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Timer,
  UserCog,
  Users,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { showcaseEnabled } from './config';

export const roles = ['cliente', 'empleado', 'administrador', 'superadministrador'] as const;
export type Role = (typeof roles)[number];

export type NavLabelKey = keyof Dictionary['app']['nav'];

export interface NavItem {
  id: string;
  to: string;
  labelKey: NavLabelKey;
  icon: LucideIcon;
  /** Roles que ven este elemento. */
  roles: readonly Role[];
  /** Solo existe si el catálogo de componentes está habilitado (`showcaseEnabled`). */
  showcase?: boolean;
}

const staff = ['administrador', 'superadministrador'] as const;

/**
 * Navegación por rol definida como datos.
 * Para añadir una sección basta con agregar un elemento y su clave en el diccionario.
 */
export const navItems: readonly NavItem[] = [
  { id: 'home', to: '/', labelKey: 'home', icon: Home, roles },
  // Cliente
  {
    id: 'projects',
    to: '/proyectos',
    labelKey: 'projects',
    icon: FolderKanban,
    roles: ['cliente'],
  },
  {
    id: 'quotes',
    to: '/cotizaciones',
    labelKey: 'quotes',
    icon: Receipt,
    roles: ['cliente', ...staff],
  },
  {
    id: 'appointments',
    to: '/citas',
    labelKey: 'appointments',
    icon: CalendarDays,
    roles: ['cliente'],
  },
  { id: 'documents', to: '/documentos', labelKey: 'documents', icon: FileText, roles: ['cliente'] },
  { id: 'support', to: '/soporte', labelKey: 'support', icon: LifeBuoy, roles: ['cliente'] },
  // Empleado
  { id: 'schedule', to: '/agenda', labelKey: 'schedule', icon: ClipboardList, roles: ['empleado'] },
  {
    id: 'customers',
    to: '/clientes',
    labelKey: 'customers',
    icon: Users,
    roles: ['empleado', ...staff],
  },
  {
    id: 'materials',
    to: '/materiales',
    labelKey: 'materials',
    icon: Package,
    roles: ['empleado', ...staff],
  },
  { id: 'timesheets', to: '/horas', labelKey: 'timesheets', icon: Timer, roles: ['empleado'] },
  // Administración
  { id: 'jobs', to: '/trabajos', labelKey: 'jobs', icon: HardHat, roles: staff },
  { id: 'employees', to: '/empleados', labelKey: 'employees', icon: UserCog, roles: staff },
  { id: 'reports', to: '/reportes', labelKey: 'reports', icon: BarChart3, roles: staff },
  // Superadministración
  {
    id: 'users',
    to: '/usuarios',
    labelKey: 'users',
    icon: ShieldCheck,
    roles: ['superadministrador'],
  },
  {
    id: 'settings',
    to: '/configuracion',
    labelKey: 'settings',
    icon: Settings,
    roles: ['superadministrador'],
  },
  {
    id: 'audit',
    to: '/auditoria',
    labelKey: 'audit',
    icon: ScrollText,
    roles: ['superadministrador'],
  },
  // Desarrollo
  {
    id: 'components',
    to: '/componentes',
    labelKey: 'components',
    icon: LayoutGrid,
    roles,
    showcase: true,
  },
];

const available = (item: NavItem) => !item.showcase || showcaseEnabled;

export function navForRole(role: Role): NavItem[] {
  return navItems.filter((item) => available(item) && item.roles.includes(role));
}

/** Elemento de navegación que corresponde a la ruta, si existe en esta compilación. */
export function findNavItem(pathname: string): NavItem | undefined {
  return navItems.find((item) => item.to === pathname && available(item));
}

/** ¿Puede este rol ver la ruta? (solo interfaz: la autorización real es de la API). */
export function canAccess(role: Role, item: Pick<NavItem, 'roles'>): boolean {
  return item.roles.includes(role);
}

/** Rutas de marcador (todas excepto inicio y componentes, que tienen página propia). */
export const placeholderItems = navItems.filter((i) => i.to !== '/' && i.id !== 'components');
