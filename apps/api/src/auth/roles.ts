// Valores en inglés, como en docs/arquitectura/modelo-datos.md; la interfaz los traduce.
export const ROLES = ['CUSTOMER', 'EMPLOYEE', 'ADMIN', 'SUPERADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const EMPLOYEE_JOB_TYPES = ['SALES', 'INSPECTOR', 'CREW_LEAD'] as const;
export type EmployeeJobType = (typeof EMPLOYEE_JOB_TYPES)[number];

export const CONTACT_METHODS = ['EMAIL', 'PHONE', 'SMS'] as const;

/** Roles que deben tener 2FA (TOTP) activo para usar la plataforma. */
export const PRIVILEGED_ROLES: readonly Role[] = ['ADMIN', 'SUPERADMIN'];

/** Personal de oficina: ve todos los registros del negocio. */
export const STAFF_ROLES: readonly Role[] = ['ADMIN', 'SUPERADMIN'];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function requiresTwoFactor(role: Role): boolean {
  return PRIVILEGED_ROLES.includes(role);
}
