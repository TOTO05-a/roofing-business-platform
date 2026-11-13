import { createHmac, randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { hashPassword } from 'better-auth/crypto';
import { expect } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Role, UserStatus } from '../../src/auth/roles.js';
import { parseEnv, type Env } from '../../src/env.js';
import { createDb, type Db } from '../../src/lib/db.js';
import type { MailMessage } from '../../src/lib/mailer.js';
import type { Storage } from '../../src/lib/storage.js';
import { createServices } from '../../src/services.js';
import { appTestDatabaseUrl, systemTestDatabaseUrl, testDatabaseUrl } from './database-url.js';

export const APP_ORIGIN = 'http://localhost:5173';
export const DEFAULT_PASSWORD = 'contraseña-de-prueba-123';

export interface TestContext {
  app: Express;
  /** Conexión del dueño (salta la RLS): solo para preparar datos y comprobar resultados. */
  db: Db;
  env: Env;
  /** Correos "enviados" durante la prueba (el mailer de pruebas los guarda aquí). */
  mail: MailMessage[];
}

export function createTestContext(
  db: Db,
  overrides: Record<string, string> = {},
  options: { storage?: Storage | null } = {},
): TestContext {
  const env = parseEnv({
    NODE_ENV: 'test',
    APP_DATABASE_URL: appTestDatabaseUrl(),
    SYSTEM_DATABASE_URL: systemTestDatabaseUrl(),
    BETTER_AUTH_SECRET: 'integration-test-secret-0123456789abcdef',
    BETTER_AUTH_URL: APP_ORIGIN,
    APP_URL: APP_ORIGIN,
    // Las pruebas simulan un proxy delante de la API y eligen la IP con X-Forwarded-For.
    TRUST_PROXY: '1',
    ...overrides,
  });
  const mail: MailMessage[] = [];
  // La API usa los roles reales (app_user / app_system), como en producción; `db` (dueño) solo
  // prepara y comprueba datos.
  const services = createServices(env, {
    db: appTestDb(),
    systemDb: systemTestDb(),
    storage: options.storage ?? null,
    mailer: {
      send: async (message) => {
        mail.push(message);
      },
    },
  });
  return { app: createApp(services), db, env, mail };
}

export function createTestDb(): Db {
  return createDb(testDatabaseUrl());
}

// Una sola conexión por rol para toda la suite (se cierran al terminar el proceso de Vitest).
let appDb: Db | undefined;
let systemDb: Db | undefined;

/** Cliente con el rol app_user (sin contexto RLS no ve nada). */
export function appTestDb(): Db {
  appDb ??= createDb(appTestDatabaseUrl());
  return appDb;
}

/** Cliente con el rol app_system. */
export function systemTestDb(): Db {
  systemDb ??= createDb(systemTestDatabaseUrl());
  return systemDb;
}

/**
 * Vacía la base de pruebas. audit_logs bloquea TRUNCATE con un trigger; solo aquí (base
 * desechable de pruebas) se desactiva un instante, dentro de la misma transacción.
 */
export async function resetDatabase(db: Db): Promise<void> {
  await db.$transaction([
    db.$executeRawUnsafe('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_truncate'),
    db.$executeRawUnsafe(
      'TRUNCATE TABLE inspection_photos, inspection_sections, inspections, files, appointments, leads, properties, audit_logs, login_throttles, invitations, customer_profiles, employee_profiles, two_factors, verifications, accounts, sessions, users CASCADE',
    ),
    db.$executeRawUnsafe('ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_truncate'),
  ]);
}

export interface CreatedUser {
  id: string;
  email: string;
  password: string;
  role: Role;
  /** CustomerProfile (rol CUSTOMER) o EmployeeProfile (rol EMPLOYEE) creado junto a la cuenta. */
  customerId?: string;
  employeeId?: string;
}

/** Crea un CustomerProfile sin cuenta (como lo da de alta la oficina). */
export async function createCustomerProfile(
  db: Db,
  options: { email?: string | null; userId?: string } = {},
): Promise<string> {
  const profile = await db.customerProfile.create({
    data: {
      firstName: 'Cliente',
      lastName: 'De Prueba',
      email: options.email === undefined ? null : options.email,
      userId: options.userId ?? null,
    },
    select: { id: true },
  });
  return profile.id;
}

export async function createUser(
  db: Db,
  options: {
    email?: string;
    password?: string;
    role?: Role;
    name?: string;
    emailVerified?: boolean;
    status?: UserStatus;
    /** Por defecto, CUSTOMER y EMPLOYEE se crean con su perfil. */
    withProfile?: boolean;
  } = {},
): Promise<CreatedUser> {
  const id = randomUUID();
  const role = options.role ?? 'CUSTOMER';
  const email = options.email ?? `${role.toLowerCase()}-${id.slice(0, 8)}@example.com`;
  const password = options.password ?? DEFAULT_PASSWORD;
  await db.user.create({
    data: {
      id,
      email,
      name: options.name ?? `Usuario ${role}`,
      role,
      emailVerified: options.emailVerified ?? true,
      status: options.status ?? 'ACTIVE',
      accounts: {
        create: { providerId: 'credential', accountId: id, password: await hashPassword(password) },
      },
    },
  });
  const created: CreatedUser = { id, email, password, role };
  if (options.withProfile ?? true) {
    if (role === 'CUSTOMER') {
      created.customerId = await createCustomerProfile(db, { email, userId: id });
    } else if (role === 'EMPLOYEE') {
      const profile = await db.employeeProfile.create({
        data: { userId: id, jobTypes: ['SALES'] },
        select: { id: true },
      });
      created.employeeId = profile.id;
    }
  }
  return created;
}

let ipCounter = 0;
/** IP distinta por agente para que el límite de intentos no se cruce entre pruebas. */
export function uniqueIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter % 250}`;
}

export type Agent = ReturnType<typeof request.agent>;

/** Cliente con cookies persistentes, Origin de la app y una IP propia. */
export function newAgent(app: Express, ip: string = uniqueIp()): Agent {
  return request
    .agent(app)
    .set('Origin', APP_ORIGIN)
    .set('X-Forwarded-For', ip)
    .set('User-Agent', 'roofing-integration-tests');
}

export function signIn(agent: Agent, email: string, password: string) {
  return agent.post('/api/auth/sign-in/email').send({ email, password });
}

// --- TOTP (RFC 6238, SHA-1, 6 dígitos, 30 s), igual que el plugin twoFactor ---

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error(`Carácter base32 inválido: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totpCode(secretBase32: string, timeMs: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 1000 / 30)));
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

export function secretFromTotpUri(totpURI: string): string {
  const secret = new URL(totpURI).searchParams.get('secret');
  if (!secret) throw new Error('El URI TOTP no trae secreto');
  return secret;
}

/** Activa 2FA TOTP para la sesión del agente y devuelve el secreto. */
export async function enableTwoFactor(agent: Agent, password: string): Promise<string> {
  const enable = await agent.post('/api/auth/two-factor/enable').send({ password });
  expect(enable.status, JSON.stringify(enable.body)).toBe(200);
  const secret = secretFromTotpUri(enable.body.totpURI as string);
  const verify = await agent
    .post('/api/auth/two-factor/verify-totp')
    .send({ code: totpCode(secret) });
  expect(verify.status, JSON.stringify(verify.body)).toBe(200);
  return secret;
}

/** Crea un usuario privilegiado, inicia sesión y activa 2FA. */
export async function signInWithTwoFactor(
  ctx: TestContext,
  role: Role = 'SUPERADMIN',
): Promise<{ agent: Agent; user: CreatedUser; secret: string }> {
  const user = await createUser(ctx.db, { role });
  const agent = newAgent(ctx.app);
  const res = await signIn(agent, user.email, user.password);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const secret = await enableTwoFactor(agent, user.password);
  return { agent, user, secret };
}

/** Extrae el primer enlace http(s) del texto de un correo. */
export function linkFrom(message: MailMessage | undefined): URL {
  const match = message?.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error('El correo no contiene un enlace');
  return new URL(match[0]);
}

export function lastMailTo(ctx: TestContext, email: string): MailMessage | undefined {
  return ctx.mail.filter((message) => message.to === email).at(-1);
}

/** Espera a que llegue un correo (los de Better Auth se envían en segundo plano). */
export async function waitForMail(ctx: TestContext, email: string): Promise<MailMessage> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const message = lastMailTo(ctx, email);
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`No llegó ningún correo a ${email}`);
}

/** Inicia sesión con una cuenta ya creada (sin 2FA: para CUSTOMER y EMPLOYEE). */
export async function loginAs(ctx: TestContext, user: CreatedUser): Promise<Agent> {
  const agent = newAgent(ctx.app);
  const res = await signIn(agent, user.email, user.password);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return agent;
}

/** Una propiedad válida de un cliente (la crea el dueño, saltando la RLS). */
export async function createProperty(
  db: Db,
  customerId: string,
  overrides: { addressLine1?: string; city?: string; zip?: string } = {},
): Promise<string> {
  const property = await db.property.create({
    data: {
      customerId,
      addressLine1: overrides.addressLine1 ?? '100 Calle Ficticia',
      city: overrides.city ?? 'Miami',
      state: 'FL',
      zip: overrides.zip ?? '33101',
    },
    select: { id: true },
  });
  return property.id;
}

/** Empleado con cuenta y perfil, listo para iniciar sesión. */
export async function createEmployee(db: Db): Promise<CreatedUser & { employeeId: string }> {
  const user = await createUser(db, { role: 'EMPLOYEE' });
  return user as CreatedUser & { employeeId: string };
}
