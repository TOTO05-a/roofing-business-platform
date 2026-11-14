import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ApiRole } from './api/auth';
import { isDev } from './config';
import { roles, type Role } from './navigation';
import { useSession } from './session';

const STORAGE_KEY = 'dev-role';

/** Rol de la API (inglés) → rol de la interfaz (español). */
const roleByApiRole: Record<ApiRole, Role> = {
  CUSTOMER: 'cliente',
  EMPLOYEE: 'empleado',
  ADMIN: 'administrador',
  SUPERADMIN: 'superadministrador',
};

interface RoleContextValue {
  /** Rol con el que se pinta la interfaz: el real, o el de la vista previa solo en desarrollo. */
  role: Role;
  /** Cambia la vista previa de rol. Solo tiene efecto con `import.meta.env.DEV`. */
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

/** Vista previa guardada por el selector de desarrollo; nunca existe en producción. */
function initialPreview(): Role | null {
  if (!isDev) return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (roles as readonly string[]).includes(stored ?? '') ? (stored as Role) : null;
  } catch {
    return null;
  }
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [preview, setPreview] = useState<Role | null>(initialPreview);
  const setRole = useCallback((next: Role) => {
    if (!isDev) return;
    setPreview(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* sin almacenamiento: solo vale para esta sesión */
    }
  }, []);

  // Sin sesión no hay rol real: "cliente" es el de menos privilegios (la API es la que manda).
  const realRole: Role =
    session.status === 'authenticated' ? roleByApiRole[session.user.role] : 'cliente';
  const role = isDev && preview ? preview : realRole;
  const value = useMemo(() => ({ role, setRole }), [role, setRole]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole debe usarse dentro de RoleProvider');
  return ctx;
}
