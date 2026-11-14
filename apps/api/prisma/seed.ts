/**
 * Seed de desarrollo: crea (si no existe) un superadministrador.
 * Las credenciales se leen de SEED_SUPERADMIN_* (ver .env.example); nunca del código.
 * Con SEED_DEMO=true crea además un usuario de demostración por rol (@cresta-roofing.example),
 * con contraseñas de SEED_DEMO_*_PASSWORD. Es idempotente: nunca modifica usuarios existentes.
 * También crea datos demo del CRM (prisma/seed-crm.ts) y de catálogo y presupuestos
 * (prisma/seed-presupuestos.ts; los enviados necesitan el almacenamiento S3) y el seed demo rico
 * (prisma/seed-demo-rico.ts). Solo en la demo local, el administrador y el superadministrador demo
 * quedan con el 2FA precargado (prisma/demo-2fa.ts).
 * Ejecuta: pnpm --filter @roofing/api db:seed
 */
import { randomUUID } from 'node:crypto';
import { hashPassword, symmetricEncrypt } from 'better-auth/crypto';
import { z } from 'zod';
import { createDb } from '../src/lib/db.js';
import { emailSchema } from '../src/lib/validation.js';
import { seedDemoCrm } from './seed-crm.js';
import { DEMO_2FA_EMAILS, DEMO_BACKUP_CODES, DEMO_TOTP_SECRET_BASE32 } from './demo-2fa.js';
import { seedDemoRich } from './seed-demo-rico.js';
import { seedDemoQuotes } from './seed-presupuestos.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../src/auth/better-auth.js';

const seedEnvSchema = z.object({
  // Obligatorio: el seed solo corre si se declara explícitamente desarrollo o pruebas.
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.url(),
  SEED_SUPERADMIN_EMAIL: emailSchema,
  SEED_SUPERADMIN_PASSWORD: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  SEED_SUPERADMIN_NAME: z.string().trim().min(1).max(100).default('Superadministrador'),
  SEED_DEMO: z.enum(['true', 'false']).default('false'),
  // Solo para precargar el 2FA de la demo (se guarda cifrado con esta misma clave).
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  SEED_DEMO_CUSTOMER_PASSWORD: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .optional(),
  SEED_DEMO_EMPLOYEE_PASSWORD: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .optional(),
  SEED_DEMO_ADMIN_PASSWORD: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH).optional(),
  SEED_DEMO_SUPERADMIN_PASSWORD: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .optional(),
});

type Db = ReturnType<typeof createDb>;
type DemoRole = 'CUSTOMER' | 'EMPLOYEE' | 'ADMIN' | 'SUPERADMIN';

interface DemoUser {
  role: DemoRole;
  name: string;
  email: string;
  passwordVar:
    | 'SEED_DEMO_CUSTOMER_PASSWORD'
    | 'SEED_DEMO_EMPLOYEE_PASSWORD'
    | 'SEED_DEMO_ADMIN_PASSWORD'
    | 'SEED_DEMO_SUPERADMIN_PASSWORD';
}

// Personas ficticias; los teléfonos usan el rango 555-01xx reservado para ficción.
const DEMO_USERS: DemoUser[] = [
  {
    role: 'CUSTOMER',
    name: 'Clara Demo',
    email: 'cliente@cresta-roofing.example',
    passwordVar: 'SEED_DEMO_CUSTOMER_PASSWORD',
  },
  {
    role: 'EMPLOYEE',
    name: 'Emilio Demo',
    email: 'empleado@cresta-roofing.example',
    passwordVar: 'SEED_DEMO_EMPLOYEE_PASSWORD',
  },
  {
    role: 'ADMIN',
    name: 'Adriana Demo',
    email: 'administrador@cresta-roofing.example',
    passwordVar: 'SEED_DEMO_ADMIN_PASSWORD',
  },
  {
    role: 'SUPERADMIN',
    name: 'Sergio Demo',
    email: 'superadmin@cresta-roofing.example',
    passwordVar: 'SEED_DEMO_SUPERADMIN_PASSWORD',
  },
];

async function seedDemoUsers(db: Db, env: z.infer<typeof seedEnvSchema>): Promise<void> {
  for (const demo of DEMO_USERS) {
    const plain = env[demo.passwordVar];
    if (!plain) {
      throw new Error(
        `Con SEED_DEMO=true falta ${demo.passwordVar} (mínimo ${PASSWORD_MIN_LENGTH} caracteres)`,
      );
    }
  }
  for (const demo of DEMO_USERS) {
    const existing = await db.user.findUnique({ where: { email: demo.email } });
    if (existing) {
      console.log(
        `El usuario demo ${demo.email} ya existe (rol ${existing.role}); no se modifica.`,
      );
      continue;
    }
    const id = randomUUID();
    const password = await hashPassword(env[demo.passwordVar] as string);
    await db.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id,
          name: demo.name,
          email: demo.email,
          emailVerified: true,
          role: demo.role,
          accounts: { create: { providerId: 'credential', accountId: id, password } },
        },
      });
      if (demo.role === 'CUSTOMER') {
        await tx.customerProfile.create({
          data: {
            userId: id,
            firstName: 'Clara',
            lastName: 'Demo',
            email: demo.email,
            phone: '+13055550143',
            preferredContact: 'EMAIL',
          },
        });
      }
      if (demo.role === 'EMPLOYEE') {
        await tx.employeeProfile.create({
          data: {
            userId: id,
            jobTypes: ['SALES', 'INSPECTOR', 'CREW_LEAD'],
            phone: '+13055550144',
          },
        });
      }
      await tx.auditLog.create({
        data: {
          action: 'seed.demo_user_create',
          entityType: 'user',
          entityId: id,
          after: { email: demo.email, role: demo.role },
        },
      });
    });
    console.log(`Usuario demo ${demo.email} creado (rol ${demo.role}).`);
  }
}

/**
 * 2FA precargado SOLO en la demo local: el administrador y el superadministrador demo quedan con
 * el 2FA activo, un secreto TOTP fijo (prisma/demo-2fa.ts, documentado en CREDENCIALES.md) y
 * códigos de respaldo fijos, guardados en el formato cifrado de Better Auth. Se reescribe en
 * cada ejecución para que coincida siempre con el BETTER_AUTH_SECRET actual. No afecta a los
 * usuarios reales ni cambia el flujo de 2FA de la aplicación.
 */
async function seedDemoTwoFactor(db: Db, env: z.infer<typeof seedEnvSchema>): Promise<void> {
  const key = env.BETTER_AUTH_SECRET;
  if (!key) {
    console.log('Sin BETTER_AUTH_SECRET: no se precarga el 2FA de la demo (se pedirá activarlo).');
    return;
  }
  const secret = await symmetricEncrypt({ key, data: `base32:${DEMO_TOTP_SECRET_BASE32}` });
  const backupCodes = await symmetricEncrypt({ key, data: JSON.stringify(DEMO_BACKUP_CODES) });
  for (const email of DEMO_2FA_EMAILS) {
    const user = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) continue;
    await db.$transaction(async (tx) => {
      await tx.twoFactor.deleteMany({ where: { userId: user.id } });
      await tx.twoFactor.create({
        data: { userId: user.id, secret, backupCodes, verified: true },
      });
      await tx.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    });
    console.log(`2FA de la demo precargado para ${email} (ver CREDENCIALES.md).`);
  }
}

async function main(): Promise<void> {
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Variables del seed inválidas:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    throw new Error('El seed de desarrollo no se ejecuta en producción');
  }

  const db = createDb(env.DATABASE_URL);
  try {
    const existing = await db.user.findUnique({ where: { email: env.SEED_SUPERADMIN_EMAIL } });
    if (existing) {
      console.log(`El usuario ${existing.email} ya existe (rol ${existing.role}); no se modifica.`);
    } else {
      await seedSuperadmin(db, env);
    }
    if (env.SEED_DEMO === 'true') {
      await seedDemoUsers(db, env);
      await seedDemoTwoFactor(db, env);
      await seedDemoCrm(db);
      await seedDemoQuotes(db);
      await seedDemoRich(db);
    }
  } finally {
    await db.$disconnect();
  }
}

async function seedSuperadmin(db: Db, env: z.infer<typeof seedEnvSchema>): Promise<void> {
  const id = randomUUID();
  const password = await hashPassword(env.SEED_SUPERADMIN_PASSWORD);
  await db.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id,
        name: env.SEED_SUPERADMIN_NAME,
        email: env.SEED_SUPERADMIN_EMAIL,
        emailVerified: true,
        role: 'SUPERADMIN',
        accounts: { create: { providerId: 'credential', accountId: id, password } },
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'seed.superadmin_create',
        entityType: 'user',
        entityId: id,
        after: { email: env.SEED_SUPERADMIN_EMAIL, role: 'SUPERADMIN' },
      },
    });
  });
  console.log(
    env.SEED_DEMO === 'true'
      ? `Superadministrador ${env.SEED_SUPERADMIN_EMAIL} creado.`
      : `Superadministrador ${env.SEED_SUPERADMIN_EMAIL} creado. Al entrar deberá activar 2FA.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
