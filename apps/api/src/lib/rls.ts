import type { Prisma } from '../generated/prisma/client.js';
import type { Role } from '../auth/roles.js';
import type { Db } from './db.js';

/**
 * Contexto de seguridad por fila (RLS, modelo de datos §4.4 y decisión T25).
 *
 * La API se conecta a PostgreSQL como `app_user` (sin BYPASSRLS y sin ser dueño de las tablas).
 * Las políticas leen quién hace la petición de variables locales a la transacción
 * (`set_config(..., true)`), así que toda consulta con datos de personas debe ir dentro de una
 * transacción que primero fije ese contexto. Sin contexto, las políticas no dejan ver nada.
 *
 * Dos formas de usarlo:
 * - `withRls(db, claims)`: cliente extendido para consultas sueltas; cada operación de modelo
 *   se envuelve en una transacción corta `[set_config, consulta]`.
 * - `rlsTransaction(db, claims, fn)`: transacción interactiva para varias operaciones que deben
 *   ser atómicas (o consultas en bruto); `fn` recibe el cliente de la transacción.
 */
export interface RlsClaims {
  userId: string;
  role: Role;
  customerId?: string | undefined;
  employeeId?: string | undefined;
}

type SqlClient = Pick<Db, '$executeRaw'>;

function setClaims(client: SqlClient, claims: RlsClaims) {
  // Valores siempre como parámetros (nunca concatenados). is_local = true: solo esta transacción.
  return client.$executeRaw`SELECT
    set_config('app.user_id', ${claims.userId}, true),
    set_config('app.role', ${claims.role}, true),
    set_config('app.customer_id', ${claims.customerId ?? ''}, true),
    set_config('app.employee_id', ${claims.employeeId ?? ''}, true)`;
}

/** Cliente extendido: cada operación de modelo corre con el contexto de `claims`. */
export function withRls(db: Db, claims: RlsClaims) {
  return db.$extends({
    name: 'rls-context',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await db.$transaction([setClaims(db, claims), query(args)]);
          return result;
        },
      },
    },
  });
}

export type RlsDb = ReturnType<typeof withRls>;

/** Cliente de una transacción interactiva (sin los métodos de conexión ni de transacción). */
export type RlsTx = Prisma.TransactionClient;

/** Transacción interactiva con el contexto de `claims` fijado antes de `fn`. */
export async function rlsTransaction<T>(
  db: Db,
  claims: RlsClaims,
  fn: (tx: RlsTx) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number },
): Promise<T> {
  return db.$transaction(async (tx) => {
    await setClaims(tx, claims);
    return fn(tx);
  }, options);
}

/**
 * Comprueba al arrancar que la conexión no salta la RLS: ni superusuario, ni BYPASSRLS, ni
 * dueño de tablas de `public`. Si lo fuera, la segunda capa de protección no existiría.
 */
export async function assertRlsEnforced(db: Db, label: string): Promise<void> {
  const rows = await db.$queryRaw<
    { role: string; superuser: boolean; bypassrls: boolean; owns_tables: boolean }[]
  >`SELECT current_user AS role, r.rolsuper AS superuser, r.rolbypassrls AS bypassrls,
      EXISTS (SELECT 1 FROM pg_tables t WHERE t.schemaname = 'public' AND t.tableowner = current_user)
        AS owns_tables
    FROM pg_roles r WHERE r.rolname = current_user`;
  const row = rows[0];
  if (!row || row.superuser || row.bypassrls || row.owns_tables) {
    throw new Error(
      `${label} se conecta como "${row?.role ?? '?'}", que salta la seguridad por fila. ` +
        'Usa los roles app_user / app_system (ver apps/api/.env.example).',
    );
  }
}
