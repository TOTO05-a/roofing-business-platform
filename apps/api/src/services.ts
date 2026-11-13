import { createAuth, type Auth } from './auth/better-auth.js';
import type { Env } from './env.js';
import { createDb, type Db } from './lib/db.js';
import { createSmtpMailer, type Mailer } from './lib/mailer.js';
import { createS3Storage, type Storage } from './lib/storage.js';

export interface AppServices {
  env: Env;
  /**
   * Conexión como `app_user`. Sin contexto RLS no ve nada: úsala siempre con `withRls` o
   * `rlsTransaction` (src/lib/rls.ts) y el AuthContext de la petición.
   */
  db: Db;
  /**
   * Conexión como `app_system`: Better Auth, aceptación de invitaciones, límite de intentos de
   * login, formulario público y carga del AuthContext. No ve las tablas del CRM.
   */
  systemDb: Db;
  mailer: Mailer;
  auth: Auth;
  /** Almacenamiento S3 de las fotos; null si no está configurado (las rutas responden 503). */
  storage: Storage | null;
}

export function createServices(
  env: Env,
  overrides: { db?: Db; systemDb?: Db; mailer?: Mailer; storage?: Storage | null } = {},
): AppServices {
  const db = overrides.db ?? createDb(env.APP_DATABASE_URL);
  const systemDb = overrides.systemDb ?? createDb(env.SYSTEM_DATABASE_URL);
  const mailer = overrides.mailer ?? createSmtpMailer(env);
  const auth = createAuth({ env, db: systemDb, mailer });
  const storage = overrides.storage === undefined ? createS3Storage(env) : overrides.storage;
  return { env, db, systemDb, mailer, auth, storage };
}
