import { HttpError } from '../lib/http-error.js';
import type { Role } from './roles.js';

/**
 * Patrón de propiedad del recurso.
 *
 * Cada recurso de negocio (proyecto, presupuesto, pago…) se describe con su dueño
 * (el cliente) y las personas empleadas asignadas. Las reglas son:
 * - ADMIN y SUPERADMIN: acceden a todo.
 * - EMPLOYEE: solo a lo que tiene asignado.
 * - CUSTOMER: solo a lo suyo.
 *
 * Uso en una ruta:
 *   const project = await db.project.findUnique({ where: { id }, select: {...} });
 *   assertCanAccess(currentUser(req), project && { ownerId: project.clientId, assigneeIds });
 *
 * Si no hay acceso se responde 404 (no 403) para no revelar que el recurso existe.
 */
export interface ResourceAccess {
  ownerId: string | null;
  assigneeIds?: readonly string[];
}

export interface Principal {
  id: string;
  role: Role;
}

export function canAccessResource(principal: Principal, resource: ResourceAccess): boolean {
  switch (principal.role) {
    case 'SUPERADMIN':
    case 'ADMIN':
      return true;
    case 'EMPLOYEE':
      return resource.assigneeIds?.includes(principal.id) ?? false;
    case 'CUSTOMER':
      return resource.ownerId !== null && resource.ownerId === principal.id;
  }
}

export function assertCanAccess(
  principal: Principal,
  resource: ResourceAccess | null | undefined,
): asserts resource is ResourceAccess {
  if (!resource || !canAccessResource(principal, resource)) {
    throw new HttpError(404, 'NOT_FOUND', 'Recurso no encontrado');
  }
}
