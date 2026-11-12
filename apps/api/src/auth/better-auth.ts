import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';
import type { Env } from '../env.js';
import { recordAudit } from '../lib/audit.js';
import type { Db } from '../lib/db.js';
import { actionEmail, type Mailer } from '../lib/mailer.js';
import { ROLES } from './roles.js';

/**
 * Cabecera interna con la IP del cliente. La API la sobrescribe en cada petición con
 * `req.ip` (que respeta TRUST_PROXY) antes de pasarla a Better Auth, así que el cliente
 * no puede falsearla. Better Auth la usa para el límite de intentos y las sesiones.
 */
export const CLIENT_IP_HEADER = 'x-roofing-client-ip';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export interface AuthDeps {
  env: Env;
  db: Db;
  mailer: Mailer;
}

export function trustedOriginsFor(env: Env): string[] {
  const origins = [env.APP_URL, env.BETTER_AUTH_URL, ...env.TRUSTED_ORIGINS].map(
    (url) => new URL(url).origin,
  );
  return [...new Set(origins)];
}

function sendInBackground(mailer: Mailer, message: Parameters<Mailer['send']>[0]): void {
  // No se espera el envío: así el tiempo de respuesta no revela si el correo existe.
  mailer.send(message).catch((error: unknown) => {
    console.error('No se pudo enviar el correo', error);
  });
}

export function createAuth({ env, db, mailer }: AuthDeps) {
  const isProduction = env.NODE_ENV === 'production';

  return betterAuth({
    appName: env.APP_NAME,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOriginsFor(env),
    database: prismaAdapter(db, { provider: 'postgresql' }),
    telemetry: { enabled: false },

    user: {
      additionalFields: {
        // `input: false`: ningún endpoint de Better Auth permite fijarlos desde el cliente.
        role: { type: [...ROLES], required: false, defaultValue: 'CLIENTE', input: false },
        active: { type: 'boolean', required: false, defaultValue: true, input: false },
      },
    },

    emailAndPassword: {
      enabled: true,
      // Registro solo por invitación (POST /api/invitations/accept).
      disableSignUp: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        sendInBackground(
          mailer,
          actionEmail({
            to: user.email,
            subject: `${env.APP_NAME}: restablece tu contraseña`,
            intro:
              'Recibimos una solicitud para restablecer tu contraseña. El enlace caduca en 1 hora. Si no fuiste tú, ignora este correo.',
            actionLabel: 'Restablecer contraseña',
            url,
          }),
        );
      },
    },

    emailVerification: {
      sendOnSignUp: false,
      // Si alguien sin verificar intenta entrar con la contraseña correcta, se le reenvía.
      sendOnSignIn: true,
      // Nunca crear sesión desde el enlace: evitaría el segundo factor de los administradores.
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        sendInBackground(
          mailer,
          actionEmail({
            to: user.email,
            subject: `${env.APP_NAME}: verifica tu correo`,
            intro: 'Confirma tu dirección de correo para poder iniciar sesión.',
            actionLabel: 'Verificar correo',
            url,
          }),
        );
      },
    },

    session: {
      // 7 días; se renueva (otros 7) si la sesión se usa pasado 1 día.
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // Sin caché en cookie: cada petición lee sesión y usuario de la base de datos, de modo
      // que desactivar a alguien o cambiar su rol surte efecto de inmediato.
      cookieCache: { enabled: false },
    },

    rateLimit: {
      enabled: true,
      // Memoria: suficiente con una sola instancia (Render). Si se escala, pasar a "database".
      storage: 'memory',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 3 },
        '/send-verification-email': { window: 60, max: 3 },
        '/two-factor/*': { window: 60, max: 5 },
      },
    },

    advanced: {
      useSecureCookies: isProduction,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: isProduction },
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      database: { generateId: 'uuid' },
    },

    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await db.user.findUnique({
              where: { id: session.userId },
              select: { active: true },
            });
            if (!user?.active) {
              throw new APIError('FORBIDDEN', {
                code: 'ACCOUNT_DISABLED',
                message: 'La cuenta está desactivada',
              });
            }
          },
          after: async (session) => {
            await recordAudit(db, {
              actorId: session.userId,
              action: 'auth.sign_in',
              entityType: 'session',
              entityId: session.id,
              ip: session.ipAddress ?? null,
            });
          },
        },
      },
    },

    plugins: [
      twoFactor({
        issuer: env.APP_NAME,
        accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 15 * 60 },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session'];
