import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { roles, type Role } from './navigation';

const STORAGE_KEY = 'dev-role';
export const isDev = import.meta.env.DEV;

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

function initialRole(): Role {
  // Hasta que exista autenticación, el rol real es "cliente".
  // En desarrollo se puede previsualizar otro rol con el selector.
  if (!isDev) return 'cliente';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (roles as readonly string[]).includes(stored ?? '') ? (stored as Role) : 'cliente';
  } catch {
    return 'cliente';
  }
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(initialRole);
  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* sin almacenamiento: solo vale para esta sesión */
    }
  }, []);
  const value = useMemo(() => ({ role, setRole }), [role, setRole]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole debe usarse dentro de RoleProvider');
  return ctx;
}
