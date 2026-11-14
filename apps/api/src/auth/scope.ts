import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from './middleware.js';
import { STAFF_ROLES } from './roles.js';

/**
 * Filtro de alcance centralizado (modelo de datos §4.4, capa API).
 *
 * Toda consulta de datos de personas o del negocio pasa por aquí: cada tabla registra una
 * función que, a partir del AuthContext, devuelve el `where` de Prisma con lo que esa
 * persona puede ver. Ningún endpoint escribe estos filtros a mano.
 *
 * Reglas generales:
 * - ADMIN y SUPERADMIN: todo (excepto lo borrado lógicamente).
 * - CUSTOMER: solo filas con su customer_id.
 * - EMPLOYEE: solo filas ligadas a sus citas o proyectos asignados (cuando existan esas
 *   tablas); de los perfiles, solo el suyo.
 *
 * Si una fila existe pero no es visible, se responde 404 (nunca 403) para no revelarla.
 * Al añadir una tabla del negocio, registra aquí su alcance y añade su caso a las pruebas.
 */

/** `where` que no coincide con ninguna fila. */
const NOTHING = { id: { in: [] as string[] } };

function isStaff(context: AuthContext): boolean {
  return STAFF_ROLES.includes(context.role);
}

export const scopes = {
  customerProfile(context: AuthContext): Prisma.CustomerProfileWhereInput {
    const base = { deletedAt: null };
    if (isStaff(context)) return base;
    if (context.role === 'CUSTOMER' && context.customerId) {
      return { ...base, id: context.customerId };
    }
    // EMPLOYEE: verá a los clientes de sus citas/proyectos cuando existan esas tablas.
    return NOTHING;
  },

  employeeProfile(context: AuthContext): Prisma.EmployeeProfileWhereInput {
    const base = { deletedAt: null };
    if (isStaff(context)) return base;
    if (context.employeeId) return { ...base, id: context.employeeId };
    return NOTHING;
  },

  property(context: AuthContext): Prisma.PropertyWhereInput {
    const base = { deletedAt: null };
    if (isStaff(context)) return base;
    if (context.role === 'CUSTOMER' && context.customerId) {
      return { ...base, customerId: context.customerId };
    }
    if (context.role === 'EMPLOYEE' && context.employeeId) {
      // Propiedades de sus citas y de sus leads.
      return {
        ...base,
        OR: [
          { appointments: { some: { assigneeId: context.employeeId, deletedAt: null } } },
          { leads: { some: { assignedToId: context.employeeId, deletedAt: null } } },
        ],
      };
    }
    return NOTHING;
  },

  lead(context: AuthContext): Prisma.LeadWhereInput {
    const base = { deletedAt: null };
    if (isStaff(context)) return base;
    if (context.role === 'EMPLOYEE' && context.employeeId) {
      return { ...base, assignedToId: context.employeeId };
    }
    return NOTHING;
  },

  appointment(context: AuthContext): Prisma.AppointmentWhereInput {
    const base = { deletedAt: null };
    if (isStaff(context)) return base;
    if (context.role === 'CUSTOMER' && context.customerId) {
      return { ...base, customerId: context.customerId };
    }
    if (context.role === 'EMPLOYEE' && context.employeeId) {
      return { ...base, assigneeId: context.employeeId };
    }
    return NOTHING;
  },

  /** Las inspecciones son internas: el cliente nunca las ve. */
  inspection(context: AuthContext): Prisma.InspectionWhereInput {
    const base = { deletedAt: null };
    if (isStaff(context)) return base;
    if (context.role === 'EMPLOYEE' && context.employeeId) {
      return {
        ...base,
        OR: [
          { inspectorId: context.employeeId },
          { appointment: { assigneeId: context.employeeId } },
        ],
      };
    }
    return NOTHING;
  },

  file(context: AuthContext): Prisma.FileWhereInput {
    const base = { deletedAt: null };
    if (isStaff(context)) return base;
    if (context.role === 'EMPLOYEE' && context.employeeId) {
      return {
        ...base,
        OR: [
          { uploadedById: context.userId },
          { inspectionPhoto: { inspection: scopes.inspection(context) } },
        ],
      };
    }
    return NOTHING;
  },
} as const;

export type ScopedModel = keyof typeof scopes;

/** Combina el alcance de la tabla con un filtro propio de la consulta. */
export function scopedWhere<M extends ScopedModel>(
  model: M,
  context: AuthContext,
  where: ReturnType<(typeof scopes)[M]> = {} as ReturnType<(typeof scopes)[M]>,
): ReturnType<(typeof scopes)[M]> {
  return { AND: [scopes[model](context), where] } as ReturnType<(typeof scopes)[M]>;
}

/** Lanza 404 si la consulta (ya filtrada por alcance) no devolvió nada. */
export function visibleOr404<T>(row: T | null | undefined): T {
  if (row === null || row === undefined) {
    throw new HttpError(404, 'NOT_FOUND', 'Recurso no encontrado');
  }
  return row;
}
