import type { RequestHandler } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import type { Db } from '../lib/db.js';
import { HttpError } from '../lib/http-error.js';
import type { Auth, AuthSession } from './better-auth.js';
import { isRole, requiresTwoFactor, type Role } from './roles.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

/**
 * Contexto de autorización de la petición (modelo de datos §4.4). Lo recibe el filtro de
 * alcance centralizado (`scope.ts`) para decidir qué filas puede ver cada persona.
 */
export interface AuthContext {
  userId: string;
  role: Role;
  /** CustomerProfile enlazado a la cuenta (no borrado). */
  customerId?: string;
  /** EmployeeProfile activo enlazado a la cuenta. */
  employeeId?: string;
}

export interface RequestAuth {
  user: AuthUser;
  sessionId: string;
  context: AuthContext;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- forma estándar de ampliar Express
  namespace Express {
    interface Request {
      /** Lo rellena `requireAuth`. */
      auth?: RequestAuth;
    }
  }
}

function toAuthUser(session: AuthSession): AuthUser {
  const { user } = session;
  if (!isRole(user.role)) {
    throw new HttpError(403, 'FORBIDDEN', 'Rol no válido');
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled === true,
  };
}

/**
 * Resuelve los perfiles de la cuenta para construir el AuthContext. Recibe la conexión
 * `app_system`: todavía no hay contexto RLS con el que consultar como la persona.
 */
export async function loadAuthContext(
  db: Pick<Db, 'user'>,
  user: Pick<AuthUser, 'id' | 'role'>,
): Promise<AuthContext> {
  const profiles = await db.user.findUnique({
    where: { id: user.id },
    select: {
      customerProfile: { select: { id: true, deletedAt: true } },
      employeeProfile: { select: { id: true, isActive: true, deletedAt: true } },
    },
  });
  const context: AuthContext = { userId: user.id, role: user.role };
  const customer = profiles?.customerProfile;
  if (customer && !customer.deletedAt) context.customerId = customer.id;
  const employee = profiles?.employeeProfile;
  if (employee && employee.isActive && !employee.deletedAt) context.employeeId = employee.id;
  return context;
}

export interface RequireAuthOptions {
  /**
   * Permite pasar a un ADMIN/SUPERADMIN que aún no activó 2FA. Solo para las rutas que
   * necesita para enrolarse (p. ej. GET /api/me). Por defecto, se exige.
   */
  allowPendingTwoFactor?: boolean;
}

/** Exige una sesión válida de Better Auth y una cuenta activa, y construye el AuthContext. */
export function requireAuth(
  { auth, systemDb }: { auth: Auth; systemDb: Db },
  options: RequireAuthOptions = {},
): RequestHandler {
  return async (req, res, next) => {
    const { headers, response: session } = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      returnHeaders: true,
    });
    // Reenvía la renovación de la cookie de sesión si Better Auth la emitió.
    const setCookie = headers.getSetCookie();
    if (setCookie.length > 0) res.append('Set-Cookie', setCookie);

    if (!session) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión');
    }
    if (session.user.status !== 'ACTIVE' || session.user.deletedAt) {
      throw new HttpError(403, 'ACCOUNT_DISABLED', 'La cuenta está desactivada');
    }
    const user = toAuthUser(session);
    if (!options.allowPendingTwoFactor && requiresTwoFactor(user.role) && !user.twoFactorEnabled) {
      throw new HttpError(
        403,
        'TWO_FACTOR_REQUIRED',
        'Activa la verificación en dos pasos para continuar',
      );
    }
    req.auth = {
      user,
      sessionId: session.session.id,
      context: await loadAuthContext(systemDb, user),
    };
    next();
  };
}

/** Exige que el usuario autenticado tenga uno de los roles indicados. Va después de `requireAuth`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const role = req.auth?.user.role;
    if (!role) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión');
    }
    if (!roles.includes(role)) {
      throw new HttpError(403, 'FORBIDDEN', 'No tienes permiso para esta acción');
    }
    next();
  };
}

function requestAuth(req: { auth?: RequestAuth | undefined }): RequestAuth {
  if (!req.auth) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión');
  }
  return req.auth;
}

/** Usuario autenticado (para handlers detrás de `requireAuth`). */
export function currentUser(req: { auth?: RequestAuth | undefined }): AuthUser {
  return requestAuth(req).user;
}

/** AuthContext de la petición (para handlers detrás de `requireAuth`). */
export function authContext(req: { auth?: RequestAuth | undefined }): AuthContext {
  return requestAuth(req).context;
}
