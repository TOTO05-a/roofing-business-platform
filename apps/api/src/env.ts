import { z } from 'zod';

const originList = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()));

// Una variable vacía en .env (`SMTP_USER=`) cuenta como no definida.
const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

/** Prefijo del secreto de ejemplo de .env.example (no debe llegar a producción). */
export const EXAMPLE_SECRET_PREFIX = 'cambia-esto';

const envSchema = z
  .object({
    // Sin valor por defecto: si faltara en producción, todo fallaría "en abierto" (cookies sin Secure…).
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    // Conexiones de la API (seguridad por fila, decisión T10). Nunca el dueño de las tablas:
    // APP_DATABASE_URL usa el rol app_user (peticiones de personas autenticadas) y
    // SYSTEM_DATABASE_URL el rol app_system (Better Auth, invitaciones, formulario público).
    // DATABASE_URL (dueño) solo lo usan las migraciones y el seed.
    APP_DATABASE_URL: z.url(),
    SYSTEM_DATABASE_URL: z.url(),

    // Better Auth. Genera el secreto con: openssl rand -base64 32
    BETTER_AUTH_SECRET: z.string().min(32, 'Debe tener al menos 32 caracteres'),
    // URL pública con la que el navegador llega a /api (mismo origen que la app gracias al proxy).
    BETTER_AUTH_URL: z.url().default('http://localhost:5173'),
    // Origen de la app React: enlaces de los correos y origen de confianza para CSRF.
    APP_URL: z.url().default('http://localhost:5173'),
    // Orígenes adicionales de confianza, separados por comas.
    TRUSTED_ORIGINS: originList,
    APP_NAME: z.string().min(1).default('Roofing Platform'),

    // Número de proxies de confianza delante de la API (Express "trust proxy").
    // 0 = conexión directa; en Render hay 1.
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

    // Correo saliente (en desarrollo, Mailpit en localhost:1025).
    SMTP_HOST: z.string().min(1).default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_SECURE: booleanString,
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    MAIL_FROM: z.string().min(3).default('Roofing Platform <no-reply@roofing.local>'),

    INVITATION_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .default(72),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['BETTER_AUTH_URL', 'APP_URL'] as const) {
      if (!env[key].startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Debe usar https en producción' });
      }
    }
    if (env.BETTER_AUTH_SECRET.startsWith(EXAMPLE_SECRET_PREFIX)) {
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_SECRET'],
        message: 'Usa un secreto propio, no el de .env.example',
      });
    }
    if (env.SMTP_HOST === 'localhost') {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'Configura un servidor SMTP real en producción',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Variables de entorno inválidas:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
