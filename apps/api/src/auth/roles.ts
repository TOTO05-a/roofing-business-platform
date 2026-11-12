export const ROLES = ['CLIENTE', 'EMPLEADO', 'ADMIN', 'SUPERADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** Roles que deben tener 2FA (TOTP) activo para usar la plataforma. */
export const PRIVILEGED_ROLES: readonly Role[] = ['ADMIN', 'SUPERADMIN'];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function requiresTwoFactor(role: Role): boolean {
  return PRIVILEGED_ROLES.includes(role);
}
