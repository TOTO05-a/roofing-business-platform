/**
 * Matriz de seguridad por fila (modelo de datos §4.4, decisión T25): rol × tabla × operación,
 * directamente contra PostgreSQL con los roles reales de la API (app_user y app_system).
 * Los datos se preparan con el dueño (salta la RLS) y cada intento corre en su propia
 * transacción con el contexto que fijaría la API.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appTestDatabaseUrl, systemTestDatabaseUrl, testDatabaseUrl } from './database-url.js';

type Role = 'CUSTOMER' | 'EMPLOYEE' | 'ADMIN' | 'SUPERADMIN';
interface Claims {
  userId: string;
  role: Role;
  customerId?: string;
  employeeId?: string;
}

const owner = new pg.Pool({ connectionString: testDatabaseUrl(), max: 2 });
const appUser = new pg.Pool({ connectionString: appTestDatabaseUrl(), max: 2 });
const appSystem = new pg.Pool({ connectionString: systemTestDatabaseUrl(), max: 2 });

const PERMISSION_DENIED = '42501'; // falta GRANT o fila rechazada por WITH CHECK
const EXCLUSION_VIOLATION = '23P01';

/** Ejecuta `sql` en una transacción con el contexto RLS de `claims` (o sin contexto). */
async function run(
  pool: pg.Pool,
  claims: Claims | null,
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (claims) {
      await client.query(
        `SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true),
                set_config('app.customer_id', $3, true), set_config('app.employee_id', $4, true)`,
        [claims.userId, claims.role, claims.customerId ?? '', claims.employeeId ?? ''],
      );
    }
    const result = await client.query(sql, params);
    await client.query('ROLLBACK'); // nada de lo probado queda escrito
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ids(pool: pg.Pool, claims: Claims | null, table: string, column = 'id') {
  const result = await run(pool, claims, `SELECT ${column}::text AS id FROM ${table}`);
  return result.rows.map((row: { id: string }) => row.id).sort();
}

async function rejectsWith(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

// --- Datos de prueba ---------------------------------------------------------------------

const id = () => randomUUID();
const u = { superadmin: id(), admin: id(), emp1: id(), emp2: id(), cust1: id(), cust2: id() };
const e1 = id();
const e2 = id();
const c1 = id();
const c2 = id();
const p1 = id();
const p2 = id();
const l1 = id(); // asignado a e1, convertido (c1/p1)
const l2 = id(); // web, sin asignar
const l3 = id(); // asignado a e2
const a1 = id(); // c1/p1, e1
const a2 = id(); // c2/p2, e2
const a3 = id(); // c1/p1, e1, sin inspección
const a4 = id(); // c2/p2, e2, sin inspección
const a5 = id(); // c1/p1, e1, inspección completada
const i1 = id(); // a1, e1, borrador
const i2 = id(); // a2, e2
const i3 = id(); // a5, e1, completada
const s1 = id();
const s2 = id();
const f1 = id(); // de e1, foto de i1
const f2 = id(); // de e2, foto de i2
const f3 = id(); // subido por admin, pendiente
const ph1 = id();
const ph2 = id();
const inv = id();
const sess = id();
const log = id();

const ctx = {
  superadmin: { userId: u.superadmin, role: 'SUPERADMIN' },
  admin: { userId: u.admin, role: 'ADMIN' },
  employee: { userId: u.emp1, role: 'EMPLOYEE', employeeId: e1 },
  customer: { userId: u.cust1, role: 'CUSTOMER', customerId: c1 },
} satisfies Record<string, Claims>;

const SHA = 'a'.repeat(64);

async function seed(): Promise<void> {
  const q = (sql: string, params: unknown[] = []) => owner.query(sql, params);
  await q(
    `INSERT INTO users (id, name, email, role, updated_at) VALUES
      ($1, 'S', 'rls-s@example.com', 'SUPERADMIN', now()),
      ($2, 'A', 'rls-a@example.com', 'ADMIN', now()),
      ($3, 'E1', 'rls-e1@example.com', 'EMPLOYEE', now()),
      ($4, 'E2', 'rls-e2@example.com', 'EMPLOYEE', now()),
      ($5, 'C1', 'rls-c1@example.com', 'CUSTOMER', now()),
      ($6, 'C2', 'rls-c2@example.com', 'CUSTOMER', now())`,
    [u.superadmin, u.admin, u.emp1, u.emp2, u.cust1, u.cust2],
  );
  await q(
    `INSERT INTO accounts (id, user_id, account_id, provider_id, password, updated_at)
     VALUES ($1, $2::uuid, $2::text, 'credential', 'hash-secreto', now())`,
    [id(), u.cust1],
  );
  await q(`INSERT INTO two_factors (id, user_id, secret, backup_codes) VALUES ($1, $2, 'x', 'y')`, [
    id(),
    u.admin,
  ]);
  await q(
    `INSERT INTO verifications (id, identifier, value, expires_at, updated_at)
     VALUES ($1, 'reset', 'token', now() + interval '1 hour', now())`,
    [id()],
  );
  await q(`INSERT INTO login_throttles (email, updated_at) VALUES ('rls-x@example.com', now())`);
  await q(
    `INSERT INTO sessions (id, user_id, token, expires_at, updated_at)
     VALUES ($1, $2, 'token-sesion', now() + interval '1 day', now())`,
    [sess, u.cust1],
  );
  await q(
    `INSERT INTO employee_profiles (id, user_id, job_types, updated_at) VALUES
      ($1, $2, '{INSPECTOR}', now()), ($3, $4, '{INSPECTOR}', now())`,
    [e1, u.emp1, e2, u.emp2],
  );
  await q(
    `INSERT INTO customer_profiles (id, user_id, first_name, last_name, updated_at) VALUES
      ($1, $2, 'Cliente', 'Uno', now()), ($3, $4, 'Cliente', 'Dos', now())`,
    [c1, u.cust1, c2, u.cust2],
  );
  await q(
    `INSERT INTO invitations (id, email, role, token_hash, expires_at, invited_by_id, customer_id)
     VALUES ($1, 'rls-inv@example.com', 'CUSTOMER', 'hash-inv', now() + interval '1 day', $2, $3)`,
    [inv, u.superadmin, c2],
  );
  await q(
    `INSERT INTO audit_logs (id, actor_user_id, action, entity_type) VALUES ($1, $2, 'x', 'y')`,
    [log, u.admin],
  );
  await q(
    `INSERT INTO properties (id, customer_id, address_line1, city, state, zip, updated_at) VALUES
      ($1, $2, '100 Demo St', 'Miami', 'FL', '33101', now()),
      ($3, $4, '200 Demo Ave', 'Doral', 'FL', '33172', now())`,
    [p1, c1, p2, c2],
  );
  await q(
    `INSERT INTO leads (id, status, source, first_name, email, assigned_to_id, customer_id, property_id, updated_at) VALUES
      ($1, 'APPOINTMENT_SET', 'PHONE', 'Uno', 'l1@example.com', $4, $5, $6, now()),
      ($2, 'NEW', 'WEB_FORM', 'Dos', 'l2@example.com', NULL, NULL, NULL, now()),
      ($3, 'CONTACTED', 'REFERRAL', 'Tres', 'l3@example.com', $7, NULL, NULL, now())`,
    [l1, l2, l3, e1, c1, p1, e2],
  );
  await q(
    `INSERT INTO appointments (id, property_id, customer_id, assignee_id, type, starts_at, ends_at, status, updated_at) VALUES
      ($1, $6, $8, $10, 'INSPECTION', '2026-12-01 14:00Z', '2026-12-01 15:00Z', 'SCHEDULED', now()),
      ($2, $7, $9, $11, 'INSPECTION', '2026-12-01 14:00Z', '2026-12-01 15:00Z', 'SCHEDULED', now()),
      ($3, $6, $8, $10, 'FOLLOW_UP', '2026-12-02 14:00Z', '2026-12-02 15:00Z', 'SCHEDULED', now()),
      ($4, $7, $9, $11, 'FOLLOW_UP', '2026-12-02 14:00Z', '2026-12-02 15:00Z', 'SCHEDULED', now()),
      ($5, $6, $8, $10, 'INSPECTION', '2026-11-01 14:00Z', '2026-11-01 15:00Z', 'COMPLETED', now())`,
    [a1, a2, a3, a4, a5, p1, p2, c1, c2, e1, e2],
  );
  await q(
    `INSERT INTO inspections (id, appointment_id, property_id, inspector_id, status, completed_at, updated_at) VALUES
      ($1, $4, $7, $9, 'DRAFT', NULL, now()),
      ($2, $5, $8, $10, 'DRAFT', NULL, now()),
      ($3, $6, $7, $9, 'COMPLETED', now(), now())`,
    [i1, i2, i3, a1, a2, a5, p1, p2, e1, e2],
  );
  await q(
    `INSERT INTO inspection_sections (id, inspection_id, name, area_sqft, pitch_rise, updated_at) VALUES
      ($1, $3, 'Principal', 1500, 6, now()), ($2, $4, 'Principal', 1800, 5, now())`,
    [s1, s2, i1, i2],
  );
  await q(
    `INSERT INTO files (id, bucket, object_key, mime_type, size_bytes, sha256, uploaded_by_id, status, updated_at) VALUES
      ($1, 'fotos', 'inspections/a/1.jpg', 'image/jpeg', 100, $4, $5, 'READY', now()),
      ($2, 'fotos', 'inspections/b/2.jpg', 'image/jpeg', 100, $4, $6, 'READY', now()),
      ($3, 'fotos', 'inspections/c/3.jpg', 'image/jpeg', 100, $4, $7, 'PENDING', now())`,
    [f1, f2, f3, SHA, u.emp1, u.emp2, u.admin],
  );
  await q(
    `INSERT INTO inspection_photos (id, inspection_id, section_id, file_id) VALUES
      ($1, $3, $5, $6), ($2, $4, NULL, $7)`,
    [ph1, ph2, i1, i2, s1, f1, f2],
  );
}

async function clean(): Promise<void> {
  await owner.query('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_truncate');
  await owner.query(
    `TRUNCATE TABLE inspection_photos, inspection_sections, inspections, files, appointments, leads,
      properties, audit_logs, login_throttles, invitations, customer_profiles, employee_profiles,
      two_factors, verifications, accounts, sessions, users CASCADE`,
  );
  await owner.query('ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_truncate');
}

beforeAll(async () => {
  await clean();
  await seed();
});

afterAll(async () => {
  await clean();
  await Promise.all([owner.end(), appUser.end(), appSystem.end()]);
});

// --- Roles y configuración -------------------------------------------------------------

describe('roles de base de datos', () => {
  it('app_user y app_system no son superusuarios, no saltan la RLS ni son dueños de tablas', async () => {
    const { rows } = await owner.query(
      `SELECT r.rolname, r.rolsuper, r.rolbypassrls,
         EXISTS (SELECT 1 FROM pg_tables t WHERE t.tableowner = r.rolname) AS owns
       FROM pg_roles r WHERE r.rolname IN ('app_user', 'app_system') ORDER BY r.rolname`,
    );
    expect(rows).toEqual([
      { rolname: 'app_system', rolsuper: false, rolbypassrls: false, owns: false },
      { rolname: 'app_user', rolsuper: false, rolbypassrls: false, owns: false },
    ]);
  });

  it('todas las tablas de public tienen RLS activada y forzada (salvo las migraciones)', async () => {
    const { rows } = await owner.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
         AND NOT (c.relrowsecurity AND c.relforcerowsecurity)`,
    );
    expect(rows).toEqual([]);
  });

  it('el esquema privado app no es accesible para app_system ni para PUBLIC', async () => {
    const { rows } = await owner.query(
      `SELECT has_schema_privilege('app_system', 'app', 'USAGE') AS system_usage,
              has_schema_privilege('app_user', 'app', 'USAGE') AS user_usage,
              has_schema_privilege('app_user', 'app', 'CREATE') AS user_create`,
    );
    expect(rows[0]).toEqual({ system_usage: false, user_usage: true, user_create: false });
  });
});

// --- Lectura (SELECT) -----------------------------------------------------------------

describe('app_user: qué filas ve cada rol', () => {
  const all = (...values: string[]) => [...values].sort();
  const cases: [table: string, expected: Record<keyof typeof ctx, string[]>][] = [
    [
      'users',
      {
        superadmin: all(...Object.values(u)),
        admin: all(...Object.values(u)),
        employee: [u.emp1],
        customer: [u.cust1],
      },
    ],
    [
      'customer_profiles',
      { superadmin: all(c1, c2), admin: all(c1, c2), employee: [c1], customer: [c1] },
    ],
    [
      'employee_profiles',
      { superadmin: all(e1, e2), admin: all(e1, e2), employee: [e1], customer: [] },
    ],
    ['properties', { superadmin: all(p1, p2), admin: all(p1, p2), employee: [p1], customer: [p1] }],
    [
      'leads',
      { superadmin: all(l1, l2, l3), admin: all(l1, l2, l3), employee: [l1], customer: [] },
    ],
    [
      'appointments',
      {
        superadmin: all(a1, a2, a3, a4, a5),
        admin: all(a1, a2, a3, a4, a5),
        employee: all(a1, a3, a5),
        customer: all(a1, a3, a5),
      },
    ],
    [
      'inspections',
      { superadmin: all(i1, i2, i3), admin: all(i1, i2, i3), employee: all(i1, i3), customer: [] },
    ],
    [
      'inspection_sections',
      { superadmin: all(s1, s2), admin: all(s1, s2), employee: [s1], customer: [] },
    ],
    [
      'inspection_photos',
      { superadmin: all(ph1, ph2), admin: all(ph1, ph2), employee: [ph1], customer: [] },
    ],
    [
      'files',
      { superadmin: all(f1, f2, f3), admin: all(f1, f2, f3), employee: [f1], customer: [] },
    ],
    ['audit_logs', { superadmin: [log], admin: [log], employee: [], customer: [] }],
    ['invitations', { superadmin: [inv], admin: [], employee: [], customer: [] }],
    ['sessions', { superadmin: [sess], admin: [], employee: [], customer: [] }],
  ];

  for (const [table, expected] of cases) {
    it(`${table}`, async () => {
      for (const [name, claims] of Object.entries(ctx) as [keyof typeof ctx, Claims][]) {
        expect(await ids(appUser, claims, table), `${table} como ${name}`).toEqual(expected[name]);
      }
      expect(await ids(appUser, null, table), `${table} sin contexto`).toEqual([]);
    });
  }

  it('nunca lee contraseñas, secretos 2FA, verificaciones, límites de login ni tokens de sesión', async () => {
    for (const table of ['accounts', 'two_factors', 'verifications', 'login_throttles']) {
      await rejectsWith(run(appUser, ctx.superadmin, `SELECT 1 FROM ${table}`), PERMISSION_DENIED);
    }
    await rejectsWith(
      run(appUser, ctx.superadmin, 'SELECT token FROM sessions'),
      PERMISSION_DENIED,
    );
  });
});

// --- Escritura de app_user ---------------------------------------------------------------

describe('app_user: escritura', () => {
  const insertCustomer = `INSERT INTO customer_profiles (id, first_name, last_name, updated_at)
    VALUES (gen_random_uuid(), 'N', 'N', now())`;

  it('solo la oficina crea clientes, propiedades, leads y citas', async () => {
    const writes = [
      insertCustomer,
      `INSERT INTO properties (id, customer_id, address_line1, city, state, zip, updated_at)
        VALUES (gen_random_uuid(), '${c1}', '1 X St', 'Miami', 'FL', '33101', now())`,
      `INSERT INTO leads (id, source, first_name, phone, updated_at)
        VALUES (gen_random_uuid(), 'PHONE', 'N', '+13055550100', now())`,
      `INSERT INTO appointments (id, property_id, customer_id, assignee_id, type, starts_at, ends_at, updated_at)
        VALUES (gen_random_uuid(), '${p1}', '${c1}', '${e1}', 'INSPECTION', '2027-01-05 14:00Z', '2027-01-05 15:00Z', now())`,
    ];
    for (const sql of writes) {
      await expect(run(appUser, ctx.admin, sql)).resolves.toMatchObject({ rowCount: 1 });
      await expect(run(appUser, ctx.superadmin, sql)).resolves.toMatchObject({ rowCount: 1 });
      await rejectsWith(run(appUser, ctx.employee, sql), PERMISSION_DENIED);
      await rejectsWith(run(appUser, ctx.customer, sql), PERMISSION_DENIED);
      await rejectsWith(run(appUser, null, sql), PERMISSION_DENIED);
    }
  });

  it('nadie borra físicamente filas del CRM ni de personas', async () => {
    for (const table of [
      'properties',
      'leads',
      'appointments',
      'inspections',
      'files',
      'customer_profiles',
      'users',
    ]) {
      await rejectsWith(run(appUser, ctx.superadmin, `DELETE FROM ${table}`), PERMISSION_DENIED);
    }
  });

  it('el empleado actualiza sus leads y citas, pero no los de otros ni los reasigna', async () => {
    const updateLead = (lead: string) =>
      `UPDATE leads SET status = 'CONTACTED' WHERE id = '${lead}'`;
    expect((await run(appUser, ctx.employee, updateLead(l1))).rowCount).toBe(1);
    expect((await run(appUser, ctx.employee, updateLead(l3))).rowCount).toBe(0);
    expect((await run(appUser, ctx.customer, updateLead(l1))).rowCount).toBe(0);
    await rejectsWith(
      run(appUser, ctx.employee, `UPDATE leads SET assigned_to_id = '${e2}' WHERE id = '${l1}'`),
      PERMISSION_DENIED,
    );

    const updateAppointment = (appointment: string) =>
      `UPDATE appointments SET status = 'CONFIRMED' WHERE id = '${appointment}'`;
    expect((await run(appUser, ctx.employee, updateAppointment(a1))).rowCount).toBe(1);
    expect((await run(appUser, ctx.employee, updateAppointment(a2))).rowCount).toBe(0);
    expect((await run(appUser, ctx.customer, updateAppointment(a1))).rowCount).toBe(0);
    await rejectsWith(
      run(
        appUser,
        ctx.employee,
        `UPDATE appointments SET assignee_id = '${e2}' WHERE id = '${a1}'`,
      ),
      PERMISSION_DENIED,
    );
  });

  it('el inspector crea la inspección solo de sus citas y la edita mientras es borrador', async () => {
    const insertInspection = (appointment: string, property: string, inspector: string) =>
      `INSERT INTO inspections (id, appointment_id, property_id, inspector_id, updated_at)
        VALUES (gen_random_uuid(), '${appointment}', '${property}', '${inspector}', now())`;
    expect((await run(appUser, ctx.employee, insertInspection(a3, p1, e1))).rowCount).toBe(1);
    await rejectsWith(run(appUser, ctx.employee, insertInspection(a4, p2, e1)), PERMISSION_DENIED);
    await rejectsWith(run(appUser, ctx.employee, insertInspection(a4, p2, e2)), PERMISSION_DENIED);
    await rejectsWith(run(appUser, ctx.customer, insertInspection(a3, p1, e1)), PERMISSION_DENIED);

    const updateFindings = (inspection: string) =>
      `UPDATE inspections SET findings = 'ok' WHERE id = '${inspection}'`;
    expect((await run(appUser, ctx.employee, updateFindings(i1))).rowCount).toBe(1);
    expect((await run(appUser, ctx.employee, updateFindings(i2))).rowCount).toBe(0);
    expect((await run(appUser, ctx.employee, updateFindings(i3))).rowCount).toBe(0); // completada
    expect((await run(appUser, ctx.admin, updateFindings(i3))).rowCount).toBe(1);
  });

  it('secciones y fotos: el inspector en su borrador; nadie más salvo la oficina', async () => {
    const insertSection = (inspection: string) =>
      `INSERT INTO inspection_sections (id, inspection_id, name, area_sqft, pitch_rise, updated_at)
        VALUES (gen_random_uuid(), '${inspection}', 'Garaje', 300, 4, now())`;
    expect((await run(appUser, ctx.employee, insertSection(i1))).rowCount).toBe(1);
    await rejectsWith(run(appUser, ctx.employee, insertSection(i2)), PERMISSION_DENIED);
    await rejectsWith(run(appUser, ctx.employee, insertSection(i3)), PERMISSION_DENIED);
    await rejectsWith(run(appUser, ctx.customer, insertSection(i1)), PERMISSION_DENIED);
    expect((await run(appUser, ctx.admin, insertSection(i2))).rowCount).toBe(1);

    expect(
      (await run(appUser, ctx.employee, `DELETE FROM inspection_sections WHERE id = '${s2}'`))
        .rowCount,
    ).toBe(0);
    expect(
      (await run(appUser, ctx.employee, `DELETE FROM inspection_photos WHERE id = '${ph2}'`))
        .rowCount,
    ).toBe(0);
    expect(
      (await run(appUser, ctx.employee, `DELETE FROM inspection_photos WHERE id = '${ph1}'`))
        .rowCount,
    ).toBe(1);
  });

  it('archivos: oficina y empleados suben a su nombre; el cliente no sube', async () => {
    const insertFile = (uploader: string) =>
      `INSERT INTO files (id, bucket, object_key, mime_type, size_bytes, sha256, uploaded_by_id, updated_at)
        VALUES (gen_random_uuid(), 'fotos', 'inspections/x/' || gen_random_uuid() || '.jpg', 'image/jpeg', 10, '${SHA}', '${uploader}', now())`;
    expect((await run(appUser, ctx.employee, insertFile(u.emp1))).rowCount).toBe(1);
    expect((await run(appUser, ctx.admin, insertFile(u.admin))).rowCount).toBe(1);
    await rejectsWith(run(appUser, ctx.employee, insertFile(u.admin)), PERMISSION_DENIED);
    await rejectsWith(run(appUser, ctx.customer, insertFile(u.cust1)), PERMISSION_DENIED);
    const markReady = (file: string) =>
      `UPDATE files SET status = 'READY', updated_at = now() WHERE id = '${file}'`;
    expect((await run(appUser, ctx.employee, markReady(f1))).rowCount).toBe(1);
    expect((await run(appUser, ctx.employee, markReady(f2))).rowCount).toBe(0);
    // Bucket y clave son inmutables, incluso para la oficina (la descarga firma esa clave).
    for (const set of [`object_key = 'inspections/b/2.jpg'`, `bucket = 'otro'`]) {
      await rejectsWith(
        run(appUser, ctx.employee, `UPDATE files SET ${set} WHERE id = '${f1}'`),
        PERMISSION_DENIED,
      );
      await rejectsWith(
        run(appUser, ctx.superadmin, `UPDATE files SET ${set} WHERE id = '${f1}'`),
        PERMISSION_DENIED,
      );
    }
  });

  it('el inspector no puede enlazar a su foto el archivo de otra persona', async () => {
    const link = (file: string) =>
      `INSERT INTO inspection_photos (id, inspection_id, file_id) VALUES (gen_random_uuid(), '${i1}', '${file}')`;
    await rejectsWith(run(appUser, ctx.employee, link(f3)), PERMISSION_DENIED); // de la oficina
    const own = await run(
      appUser,
      ctx.employee,
      `WITH f AS (
         INSERT INTO files (id, bucket, object_key, mime_type, size_bytes, sha256, uploaded_by_id, updated_at)
         VALUES (gen_random_uuid(), 'fotos', 'inspections/y/' || gen_random_uuid() || '.jpg', 'image/jpeg', 10, '${SHA}', '${u.emp1}', now())
         RETURNING id)
       INSERT INTO inspection_photos (id, inspection_id, file_id) SELECT gen_random_uuid(), '${i1}', id FROM f`,
    );
    expect(own.rowCount).toBe(1);
  });

  it('solo la oficina cambia las columnas de enlace (cliente, propiedad, cita, asignado, horario)', async () => {
    const attempts = [
      `UPDATE leads SET customer_id = '${c2}', property_id = '${p2}' WHERE id = '${l1}'`,
      `UPDATE leads SET source = 'WEB_FORM' WHERE id = '${l1}'`,
      `UPDATE appointments SET starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' WHERE id = '${a1}'`,
      `UPDATE appointments SET lead_id = '${l3}' WHERE id = '${a1}'`,
      `UPDATE inspections SET appointment_id = '${a3}' WHERE id = '${i1}'`,
    ];
    for (const sql of attempts) {
      await rejectsWith(run(appUser, ctx.employee, sql), PERMISSION_DENIED);
    }
    expect(
      (
        await run(
          appUser,
          ctx.admin,
          `UPDATE appointments SET lead_id = '${l3}' WHERE id = '${a1}'`,
        )
      ).rowCount,
    ).toBe(1);
    // Lo que sí le toca al empleado sigue funcionando.
    expect(
      (
        await run(
          appUser,
          ctx.employee,
          `UPDATE appointments SET status = 'IN_PROGRESS' WHERE id = '${a1}'`,
        )
      ).rowCount,
    ).toBe(1);
  });

  it('auditoría: cada quien inserta a su nombre; nadie modifica ni borra', async () => {
    const insertLog = (actor: string) =>
      `INSERT INTO audit_logs (id, actor_user_id, action, entity_type) VALUES (gen_random_uuid(), '${actor}', 'x', 'y')`;
    expect((await run(appUser, ctx.customer, insertLog(u.cust1))).rowCount).toBe(1);
    await rejectsWith(run(appUser, ctx.customer, insertLog(u.superadmin)), PERMISSION_DENIED);
    await rejectsWith(
      run(appUser, ctx.superadmin, `UPDATE audit_logs SET action = 'z'`),
      PERMISSION_DENIED,
    );
    await rejectsWith(run(appUser, ctx.superadmin, 'DELETE FROM audit_logs'), PERMISSION_DENIED);
    await rejectsWith(run(appUser, ctx.superadmin, 'TRUNCATE audit_logs'), PERMISSION_DENIED);
  });

  it('cuentas: solo SUPERADMIN cambia rol o estado, nunca el correo; solo él cierra sesiones', async () => {
    const promote = `UPDATE users SET role = 'ADMIN' WHERE id = '${u.emp1}'`;
    expect((await run(appUser, ctx.superadmin, promote)).rowCount).toBe(1);
    expect((await run(appUser, ctx.admin, promote)).rowCount).toBe(0);
    expect((await run(appUser, ctx.employee, promote)).rowCount).toBe(0);
    await rejectsWith(
      run(
        appUser,
        ctx.superadmin,
        `UPDATE users SET email = 'otro@example.com' WHERE id = '${u.emp1}'`,
      ),
      PERMISSION_DENIED,
    );
    expect((await run(appUser, ctx.superadmin, 'DELETE FROM sessions')).rowCount).toBe(1);
    expect((await run(appUser, ctx.admin, 'DELETE FROM sessions')).rowCount).toBe(0);
  });

  it('invitaciones: solo SUPERADMIN y firmadas con su propio id', async () => {
    const invite = (invitedBy: string) =>
      `INSERT INTO invitations (id, email, role, token_hash, expires_at, invited_by_id)
        VALUES (gen_random_uuid(), 'nuevo@example.com', 'ADMIN', gen_random_uuid()::text, now() + interval '1 day', '${invitedBy}')`;
    expect((await run(appUser, ctx.superadmin, invite(u.superadmin))).rowCount).toBe(1);
    await rejectsWith(run(appUser, ctx.superadmin, invite(u.admin)), PERMISSION_DENIED);
    await rejectsWith(run(appUser, ctx.admin, invite(u.admin)), PERMISSION_DENIED);
  });
});

// --- app_system -------------------------------------------------------------------------

describe('app_system', () => {
  it('ve las tablas de autenticación pero no el CRM (salvo leads web recientes)', async () => {
    expect(await ids(appSystem, null, 'users')).toHaveLength(Object.values(u).length);
    expect(await ids(appSystem, null, 'accounts')).toHaveLength(1);
    expect(await ids(appSystem, null, 'leads')).toEqual([l2]);
    for (const table of [
      'properties',
      'appointments',
      'inspections',
      'inspection_sections',
      'inspection_photos',
      'files',
    ]) {
      await rejectsWith(run(appSystem, null, `SELECT 1 FROM ${table}`), PERMISSION_DENIED);
    }
    await rejectsWith(run(appSystem, null, 'SELECT 1 FROM audit_logs'), PERMISSION_DENIED);
  });

  it('solo crea leads WEB_FORM nuevos o spam, sin asignar ni convertir', async () => {
    const insertLead = (fields: string, values: string) =>
      `INSERT INTO leads (id, first_name, email, updated_at, ${fields})
        VALUES (gen_random_uuid(), 'Web', 'web@example.com', now(), ${values})`;
    expect(
      (await run(appSystem, null, insertLead('source, status', `'WEB_FORM', 'NEW'`))).rowCount,
    ).toBe(1);
    expect(
      (await run(appSystem, null, insertLead('source, status', `'WEB_FORM', 'SPAM'`))).rowCount,
    ).toBe(1);
    await rejectsWith(run(appSystem, null, insertLead('source', `'PHONE'`)), PERMISSION_DENIED);
    await rejectsWith(
      run(appSystem, null, insertLead('source, status', `'WEB_FORM', 'CONTACTED'`)),
      PERMISSION_DENIED,
    );
    await rejectsWith(
      run(appSystem, null, insertLead('source, assigned_to_id', `'WEB_FORM', '${e1}'`)),
      PERMISSION_DENIED,
    );
    await rejectsWith(run(appSystem, null, `UPDATE leads SET status = 'SPAM'`), PERMISSION_DENIED);
  });

  it('solo toca las columnas que necesita en invitaciones y perfiles de cliente', async () => {
    await rejectsWith(
      run(appSystem, null, `UPDATE invitations SET role = 'SUPERADMIN'`),
      PERMISSION_DENIED,
    );
    await rejectsWith(
      run(appSystem, null, `UPDATE customer_profiles SET first_name = 'x'`),
      PERMISSION_DENIED,
    );
  });
});

// --- Citas solapadas ------------------------------------------------------------------

describe('citas solapadas (EXCLUDE con btree_gist)', () => {
  const insert = (start: string, end: string) =>
    owner.query(
      `INSERT INTO appointments (id, property_id, customer_id, assignee_id, type, starts_at, ends_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'INSPECTION', $4, $5, now())`,
      [p1, c1, e1, start, end],
    );

  it('rechaza una cita activa que se solapa con otra del mismo empleado', async () => {
    await rejectsWith(insert('2026-12-01 14:30Z', '2026-12-01 15:30Z'), EXCLUSION_VIOLATION);
  });

  it('admite citas contiguas, canceladas o de otro empleado', async () => {
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      const values = (start: string, end: string, status: string, assignee: string) => [
        p1,
        c1,
        assignee,
        start,
        end,
        status,
        status === 'CANCELED' ? 'motivo' : null,
      ];
      const sql = `INSERT INTO appointments (id, property_id, customer_id, assignee_id, type, starts_at, ends_at, status, cancel_reason, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, 'INSPECTION', $4, $5, $6, $7, now())`;
      await client.query(sql, values('2026-12-01 15:00Z', '2026-12-01 16:00Z', 'SCHEDULED', e1));
      await client.query(sql, values('2026-12-01 14:30Z', '2026-12-01 15:30Z', 'CANCELED', e1));
      // e2 ya tiene a2 de 14:00 a 15:00: se usa otra franja para probar solo el cambio de empleado.
      await client.query(sql, values('2026-12-03 14:30Z', '2026-12-03 15:30Z', 'SCHEDULED', e2));
      await client.query(sql, values('2026-12-03 14:30Z', '2026-12-03 15:30Z', 'SCHEDULED', e1));
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('exige que la propiedad de la cita sea del mismo cliente', async () => {
    await rejectsWith(
      owner.query(
        `INSERT INTO appointments (id, property_id, customer_id, assignee_id, type, starts_at, ends_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'INSPECTION', '2027-02-01 14:00Z', '2027-02-01 15:00Z', now())`,
        [p2, c1, e1],
      ),
      '23503',
    );
  });
});
