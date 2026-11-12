/**
 * Seed de desarrollo: crea (si no existe) un superadministrador.
 * Las credenciales se leen de SEED_SUPERADMIN_* (ver .env.example); nunca del código.
 * Ejecuta: pnpm --filter @roofing/api db:seed
 */
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { createDb } from '../src/lib/db.js';
import { emailSchema } from '../src/lib/validation.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../src/auth/better-auth.js';

const seedEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  SEED_SUPERADMIN_EMAIL: emailSchema,
  SEED_SUPERADMIN_PASSWORD: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  SEED_SUPERADMIN_NAME: z.string().trim().min(1).max(100).default('Superadministrador'),
});

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
      return;
    }
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
        data: { action: 'seed.superadmin_create', entityType: 'user', entityId: id },
      });
    });
    console.log(
      `Superadministrador ${env.SEED_SUPERADMIN_EMAIL} creado. Al entrar deberá activar 2FA.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
