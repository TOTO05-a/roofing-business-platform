import type { Dictionary } from '@roofing/shared/i18n';
import {
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FolderKanban,
  Home,
  LayoutGrid,
  MapPin,
  Package,
  Receipt,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
  Wallet,
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
  { id: 'projects', to: '/proyectos', labelKey: 'projects', icon: FolderKanban, roles },
  {
    id: 'quotes',
    to: '/cotizaciones',
    labelKey: 'quotes',
    icon: Receipt,
    roles: ['cliente', 'empleado', ...staff],
  },
  {
    id: 'invoices',
    to: '/facturas',
    labelKey: 'invoices',
    icon: Wallet,
    roles: ['cliente', ...staff],
  },
  {
    id: 'appointments',
    to: '/citas',
    labelKey: 'appointments',
    icon: CalendarDays,
    roles: ['cliente'],
  },
  // Empleado
  {
    id: 'schedule',
    to: '/agenda',
    labelKey: 'schedule',
    icon: ClipboardList,
    roles: ['empleado', ...staff],
  },
  {
    id: 'leads',
    to: '/leads',
    labelKey: 'leads',
    icon: UserPlus,
    roles: ['empleado', ...staff],
  },
  // La API solo deja listar clientes a la oficina (P6): el empleado llega a ellos por citas y propiedades.
  { id: 'customers', to: '/clientes', labelKey: 'customers', icon: Users, roles: staff },
  {
    id: 'properties',
    to: '/propiedades',
    labelKey: 'properties',
    icon: MapPin,
    roles: ['cliente', 'empleado', ...staff],
  },
  {
    id: 'inspections',
    to: '/inspecciones',
    labelKey: 'inspections',
    icon: ClipboardCheck,
    roles: ['empleado', ...staff],
  },
  {
    id: 'materials',
    to: '/materiales',
    labelKey: 'materials',
    icon: Package,
    roles: staff,
  },
  // Administración
  { id: 'employees', to: '/empleados', labelKey: 'employees', icon: UserCog, roles: staff },
  // Superadministración
  {
    id: 'users',
    to: '/usuarios',
    labelKey: 'users',
    icon: ShieldCheck,
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

/** Elemento de navegación que corresponde a la ruta (o a una subruta, como `/leads/:id`). */
export function findNavItem(pathname: string): NavItem | undefined {
  return navItems.find(
    (item) =>
      available(item) &&
      (item.to === pathname || (item.to !== '/' && pathname.startsWith(`${item.to}/`))),
  );
}

/** ¿Puede este rol ver la ruta? (solo interfaz: la autorización real es de la API). */
export function canAccess(role: Role, item: Pick<NavItem, 'roles'>): boolean {
  return item.roles.includes(role);
}

/** Secciones con pantalla propia: el CRM (leads, clientes, propiedades, agenda, inspecciones). */
export const crmItemIds = [
  'leads',
  'customers',
  'properties',
  'schedule',
  'appointments',
  'inspections',
] as const;

/** Rutas de marcador (las que aún no tienen pantalla propia). */
export const placeholderItems = navItems.filter(
  (i) => i.to !== '/' && i.id !== 'components' && !(crmItemIds as readonly string[]).includes(i.id),
);
