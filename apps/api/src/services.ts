import { createAuth, type Auth } from './auth/better-auth.js';
import type { Env } from './env.js';
import { createDb, type Db } from './lib/db.js';
import { createSmtpMailer, type Mailer } from './lib/mailer.js';

export interface AppServices {
  env: Env;
  db: Db;
  mailer: Mailer;
  auth: Auth;
}

export function createServices(
  env: Env,
  overrides: { db?: Db; mailer?: Mailer } = {},
): AppServices {
  const db = overrides.db ?? createDb(env.DATABASE_URL);
  const mailer = overrides.mailer ?? createSmtpMailer(env);
  const auth = createAuth({ env, db, mailer });
  return { env, db, mailer, auth };
}
