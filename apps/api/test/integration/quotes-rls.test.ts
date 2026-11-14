/**
 * Matriz de RLS e inmutabilidad del catálogo y los presupuestos (Etapa 3, modelo de datos §2.5 y
 * §4.4): rol × tabla × operación contra PostgreSQL con los roles reales de la API.
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

const PERMISSION_DENIED = '42501';
const INTEGRITY = '23000'; // integrity_constraint_violation (disparadores de inmutabilidad)
const CHECK_VIOLATION = '23514';

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
    await client.query('ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ids(pool: pg.Pool, claims: Claims | null, table: string) {
  const result = await run(pool, claims, `SELECT id::text AS id FROM ${table}`);
  return result.rows.map((row: { id: string }) => row.id).sort();
}

const rejectsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ code });

const id = () => randomUUID();
const u = {
  admin: id(),
  superadmin: id(),
  sales1: id(),
  sales2: id(),
  crew: id(),
  cust1: id(),
  cust2: id(),
};
const e = { sales1: id(), sales2: id(), crew: id() };
const c1 = id();
const c2 = id();
const p1 = id();
const p2 = id();
const cat = id();
const item = id();
const pkg = id();
const q1 = id(); // c1, vendedor sales1, enviado
const q2 = id(); // c2, vendedor sales2, enviado
const q3 = id(); // c1, vendedor sales1, solo borrador
const v1 = id(); // q1 SENT
const v2 = id(); // q2 SENT
const v3 = id(); // q3 DRAFT
const o1 = id();
const o2 = id();
const o3 = id();
const l1 = id();
const l2 = id();
const l3 = id();
const f1 = id(); // PDF de v1
const f2 = id(); // PDF de v2
const SHA = 'b'.repeat(64);

const ctx = {
  admin: { userId: u.admin, role: 'ADMIN' },
  superadmin: { userId: u.superadmin, role: 'SUPERADMIN' },
  sales1: { userId: u.sales1, role: 'EMPLOYEE', employeeId: e.sales1 },
  crew: { userId: u.crew, role: 'EMPLOYEE', employeeId: e.crew },
  customer1: { userId: u.cust1, role: 'CUSTOMER', customerId: c1 },
} satisfies Record<string, Claims>;

async function seed() {
  const q = (sql: string, params: unknown[] = []) => owner.query(sql, params);
  await q(
    `INSERT INTO users (id, name, email, role, updated_at) VALUES
      ($1,'A','qa@example.com','ADMIN',now()), ($2,'S','qs@example.com','SUPERADMIN',now()),
      ($3,'V1','qv1@example.com','EMPLOYEE',now()), ($4,'V2','qv2@example.com','EMPLOYEE',now()),
      ($5,'Cu','qcu@example.com','EMPLOYEE',now()),
      ($6,'C1','qc1@example.com','CUSTOMER',now()), ($7,'C2','qc2@example.com','CUSTOMER',now())`,
    [u.admin, u.superadmin, u.sales1, u.sales2, u.crew, u.cust1, u.cust2],
  );
  await q(
    `INSERT INTO employee_profiles (id, user_id, job_types, updated_at) VALUES
      ($1,$4,'{SALES}',now()), ($2,$5,'{SALES}',now()), ($3,$6,'{CREW_LEAD}',now())`,
    [e.sales1, e.sales2, e.crew, u.sales1, u.sales2, u.crew],
  );
  await q(
    `INSERT INTO customer_profiles (id, user_id, first_name, last_name, updated_at) VALUES
      ($1,$3,'Cliente','Uno',now()), ($2,$4,'Cliente','Dos',now())`,
    [c1, c2, u.cust1, u.cust2],
  );
  await q(
    `INSERT INTO properties (id, customer_id, address_line1, city, state, zip, updated_at) VALUES
      ($1,$3,'1 Demo St','Miami','FL','33101',now()), ($2,$4,'2 Demo St','Doral','FL','33172',now())`,
    [p1, p2, c1, c2],
  );
  await q(
    `INSERT INTO categories (id, name, kind, updated_at) VALUES ($1,'Tejas','MATERIAL',now())`,
    [cat],
  );
  await q(
    `INSERT INTO catalog_items (id, name, kind, category_id, unit, material_price_cents, labor_price_cents, updated_at)
     VALUES ($1,'Teja','MATERIAL',$2,'SQUARE',10000,0,now())`,
    [item, cat],
  );
  await q(
    `INSERT INTO packages (id, tier, name, warranty_text, warranty_years, updated_at)
     VALUES ($1,'BASIC','Básico','Garantía',10,now())`,
    [pkg],
  );
  await q(
    `INSERT INTO files (id, bucket, object_key, mime_type, size_bytes, sha256, uploaded_by_id, status, updated_at) VALUES
      ($1,'b','quotes/a/1.pdf','application/pdf',100,$3,$4,'READY',now()),
      ($2,'b','quotes/b/2.pdf','application/pdf',100,$3,$4,'READY',now())`,
    [f1, f2, SHA, u.admin],
  );
  await q(
    `INSERT INTO quotes (id, customer_id, property_id, sales_rep_id, created_by_id, first_sent_at, updated_at) VALUES
      ($1,$4,$6,$8,$10,now(),now()), ($2,$5,$7,$9,$10,now(),now()), ($3,$4,$6,$8,$10,NULL,now())`,
    [q1, q2, q3, c1, c2, p1, p2, e.sales1, e.sales2, u.admin],
  );
  const version = `INSERT INTO quote_versions (id, quote_id, version_number, status, waste_bps, tax_bps, deposit_bps,
      measurements_snapshot, sent_at, locked_at, pdf_file_id, pdf_sha256, created_by_id, updated_at)`;
  await q(
    `${version} VALUES ($1,$3,1,'SENT',1000,700,5000,'{}',now(),now(),$5,$7,$8,now()),
      ($2,$4,1,'SENT',1000,700,5000,'{}',now(),now(),$6,$7,$8,now())`,
    [v1, v2, q1, q2, f1, f2, SHA, u.admin],
  );
  await q(`${version} VALUES ($1,$2,1,'DRAFT',1000,700,5000,'{}',NULL,NULL,NULL,NULL,$3,now())`, [
    v3,
    q3,
    u.admin,
  ]);
  await q(
    `INSERT INTO quote_options (id, version_id, package_id, tier, title, warranty_text, warranty_years,
       material_subtotal_cents, labor_subtotal_cents, discount_cents, tax_cents, total_cents, deposit_cents, balance_cents)
     VALUES ($1,$2,$3,'BASIC','Básico','G',10,1000,500,0,70,1570,785,785)`,
    [o3, v3, pkg],
  );
}

/** Las opciones de v1 y v2 se insertan antes de bloquear: se hace en una transacción aparte. */
async function seedLockedOptions() {
  // Las versiones ya están bloqueadas (el guard lo impide): se desactiva el trigger solo aquí.
  for (const [o, v, l] of [
    [o1, v1, l1],
    [o2, v2, l2],
  ] as const) {
    await owner.query('ALTER TABLE quote_options DISABLE TRIGGER quote_options_guard');
    await owner.query('ALTER TABLE quote_lines DISABLE TRIGGER quote_lines_guard');
    await owner.query(
      `INSERT INTO quote_options (id, version_id, package_id, tier, title, warranty_text, warranty_years,
         material_subtotal_cents, labor_subtotal_cents, discount_cents, tax_cents, total_cents, deposit_cents, balance_cents)
       VALUES ($1,$2,$3,'BASIC','Básico','G',10,1000,500,0,70,1570,785,785) ON CONFLICT DO NOTHING`,
      [o, v, pkg],
    );
    await owner.query(
      `INSERT INTO quote_lines (id, option_id, sort_order, name, kind, unit, quantity, purchase_quantity,
         unit_material_price_cents, unit_labor_price_cents, line_material_cents, line_labor_cents, line_total_cents)
       VALUES ($1,$2,0,'Teja','MATERIAL','SQUARE',1,1,1000,500,1000,500,1500)`,
      [l, o],
    );
    await owner.query('ALTER TABLE quote_options ENABLE TRIGGER quote_options_guard');
    await owner.query('ALTER TABLE quote_lines ENABLE TRIGGER quote_lines_guard');
  }
  await owner.query(
    `INSERT INTO quote_lines (id, option_id, sort_order, name, kind, unit, quantity, purchase_quantity,
       unit_material_price_cents, unit_labor_price_cents, line_material_cents, line_labor_cents, line_total_cents)
     VALUES ($1,$2,0,'Teja','MATERIAL','SQUARE',1,1,1000,500,1000,500,1500)`,
    [l3, o3],
  );
}

async function clean() {
  await owner.query('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_truncate');
  await owner.query(
    `TRUNCATE TABLE quote_lines, quote_options, quote_versions, quotes, package_items, packages,
      material_options, purchase_units, catalog_items, categories, files, properties, audit_logs,
      customer_profiles, employee_profiles, sessions, users CASCADE`,
  );
  await owner.query('ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_truncate');
}

beforeAll(async () => {
  await clean();
  await seed();
  await seedLockedOptions();
});

afterAll(async () => {
  await clean();
  await Promise.all([owner.end(), appUser.end(), appSystem.end()]);
});

describe('presupuestos: qué ve cada rol (app_user)', () => {
  const all = (...v: string[]) => [...v].sort();
  const cases: [string, Record<keyof typeof ctx, string[]>][] = [
    [
      'quotes',
      {
        admin: all(q1, q2, q3),
        superadmin: all(q1, q2, q3),
        sales1: all(q1, q3),
        crew: [],
        customer1: [q1],
      },
    ],
    [
      'quote_versions',
      {
        admin: all(v1, v2, v3),
        superadmin: all(v1, v2, v3),
        sales1: [v1],
        crew: [],
        customer1: [v1],
      },
    ],
    [
      'quote_options',
      {
        admin: all(o1, o2, o3),
        superadmin: all(o1, o2, o3),
        sales1: [o1],
        crew: [],
        customer1: [o1],
      },
    ],
    [
      'quote_lines',
      {
        admin: all(l1, l2, l3),
        superadmin: all(l1, l2, l3),
        sales1: [l1],
        crew: [],
        customer1: [l1],
      },
    ],
    ['catalog_items', { admin: [item], superadmin: [item], sales1: [], crew: [], customer1: [] }],
    ['categories', { admin: [cat], superadmin: [cat], sales1: [], crew: [], customer1: [] }],
    ['packages', { admin: [pkg], superadmin: [pkg], sales1: [], crew: [], customer1: [] }],
    ['purchase_units', { admin: [], superadmin: [], sales1: [], crew: [], customer1: [] }],
    ['material_options', { admin: [], superadmin: [], sales1: [], crew: [], customer1: [] }],
    ['package_items', { admin: [], superadmin: [], sales1: [], crew: [], customer1: [] }],
  ];
  for (const [table, expected] of cases) {
    it(table, async () => {
      for (const [name, claims] of Object.entries(ctx) as [keyof typeof ctx, Claims][]) {
        expect(await ids(appUser, claims, table), `${table} como ${name}`).toEqual(expected[name]);
      }
      expect(await ids(appUser, null, table), `${table} sin contexto`).toEqual([]);
    });
  }

  it('el PDF de un presupuesto lo ve quien ve la versión', async () => {
    expect(await ids(appUser, ctx.customer1, 'files')).toEqual([f1]);
    expect(await ids(appUser, ctx.sales1, 'files')).toEqual([f1]);
    expect(await ids(appUser, ctx.crew, 'files')).toEqual([]);
  });

  it('ventas ve al cliente y la propiedad de sus presupuestos, no los de otros', async () => {
    expect(await ids(appUser, ctx.sales1, 'customer_profiles')).toEqual([c1]);
    expect(await ids(appUser, ctx.sales1, 'properties')).toEqual([p1]);
  });

  it('app_system no toca catálogo ni presupuestos', async () => {
    for (const table of ['quotes', 'quote_versions', 'catalog_items', 'packages']) {
      await rejectsWith(run(appSystem, null, `SELECT 1 FROM ${table}`), PERMISSION_DENIED);
    }
  });
});

describe('presupuestos: escritura (app_user)', () => {
  const insertItem = `INSERT INTO catalog_items (id, name, kind, category_id, unit, material_price_cents, labor_price_cents, updated_at)
    VALUES (gen_random_uuid(), 'X', 'MATERIAL', '${cat}', 'UNIT', 100, 0, now())`;

  it('solo la oficina escribe el catálogo', async () => {
    await expect(run(appUser, ctx.admin, insertItem)).resolves.toMatchObject({ rowCount: 1 });
    await expect(run(appUser, ctx.superadmin, insertItem)).resolves.toMatchObject({ rowCount: 1 });
    await rejectsWith(run(appUser, ctx.sales1, insertItem), PERMISSION_DENIED);
    await rejectsWith(run(appUser, ctx.crew, insertItem), PERMISSION_DENIED);
    await rejectsWith(run(appUser, ctx.customer1, insertItem), PERMISSION_DENIED);
    expect((await run(appUser, ctx.sales1, `UPDATE catalog_items SET name = 'Y'`)).rowCount).toBe(
      0,
    );
  });

  it('solo la oficina crea presupuestos; nadie borra versiones', async () => {
    const insertQuote = `INSERT INTO quotes (id, customer_id, property_id, created_by_id, updated_at)
      VALUES (gen_random_uuid(), '${c1}', '${p1}', '${u.admin}', now())`;
    await expect(run(appUser, ctx.admin, insertQuote)).resolves.toMatchObject({ rowCount: 1 });
    await rejectsWith(run(appUser, ctx.sales1, insertQuote), PERMISSION_DENIED);
    await rejectsWith(run(appUser, ctx.customer1, insertQuote), PERMISSION_DENIED);
    await rejectsWith(
      run(appUser, ctx.superadmin, 'DELETE FROM quote_versions'),
      PERMISSION_DENIED,
    );
    await rejectsWith(run(appUser, ctx.superadmin, 'DELETE FROM quotes'), PERMISSION_DENIED);
  });

  it('el número de presupuesto se genera solo (Q-AAAA-NNNNNN)', async () => {
    const result = await run(
      appUser,
      ctx.admin,
      `INSERT INTO quotes (id, customer_id, property_id, created_by_id, updated_at)
       VALUES (gen_random_uuid(), '${c1}', '${p1}', '${u.admin}', now()) RETURNING number`,
    );
    expect(result.rows[0].number).toMatch(/^Q-\d{4}-\d{6}$/);
  });

  it('el cliente marca vista o rechaza SU versión enviada; no la de otro ni otro estado', async () => {
    const setStatus = (version: string, status: string) =>
      `UPDATE quote_versions SET status = '${status}', viewed_at = now(), declined_at = now(), updated_at = now() WHERE id = '${version}'`;
    expect((await run(appUser, ctx.customer1, setStatus(v1, 'VIEWED'))).rowCount).toBe(1);
    expect((await run(appUser, ctx.customer1, setStatus(v1, 'DECLINED'))).rowCount).toBe(1);
    expect((await run(appUser, ctx.customer1, setStatus(v2, 'VIEWED'))).rowCount).toBe(0);
    await rejectsWith(run(appUser, ctx.customer1, setStatus(v1, 'SUPERSEDED')), PERMISSION_DENIED);
    await rejectsWith(
      run(
        appUser,
        ctx.customer1,
        `UPDATE quote_versions SET discount_bps = 5000 WHERE id = '${v1}'`,
      ),
      INTEGRITY,
    );
    // Ventas y cuadrilla no cambian estados.
    expect((await run(appUser, ctx.sales1, setStatus(v1, 'VIEWED'))).rowCount).toBe(0);
    expect((await run(appUser, ctx.crew, setStatus(v1, 'VIEWED'))).rowCount).toBe(0);
  });
});

describe('inmutabilidad de las versiones enviadas (todos los roles, también el dueño)', () => {
  it('una versión enviada no cambia precios, parámetros ni medidas', async () => {
    for (const set of [
      'discount_bps = 9000',
      'tax_bps = 0',
      `measurements_snapshot = '{"x":1}'`,
      `pdf_sha256 = '${'c'.repeat(64)}'`,
      'locked_at = NULL',
    ]) {
      await rejectsWith(
        owner.query(`UPDATE quote_versions SET ${set} WHERE id = '${v1}'`),
        INTEGRITY,
      );
      await rejectsWith(
        run(appUser, ctx.admin, `UPDATE quote_versions SET ${set} WHERE id = '${v1}'`),
        INTEGRITY,
      );
    }
  });

  it('sus opciones y líneas no se crean, editan ni borran; las del borrador sí', async () => {
    const newOption = (version: string, pack = pkg) =>
      `INSERT INTO quote_options (id, version_id, package_id, tier, title, warranty_text, warranty_years,
         material_subtotal_cents, labor_subtotal_cents, discount_cents, tax_cents, total_cents, deposit_cents, balance_cents)
       VALUES (gen_random_uuid(), '${version}', '${pack}', 'BETTER', 'x', 'g', 1, 0, 0, 0, 0, 0, 0, 0)`;
    await rejectsWith(run(appUser, ctx.admin, newOption(v1)), INTEGRITY);
    await rejectsWith(
      run(appUser, ctx.admin, `DELETE FROM quote_options WHERE id = '${o1}'`),
      INTEGRITY,
    );
    await rejectsWith(
      run(appUser, ctx.admin, `DELETE FROM quote_lines WHERE id = '${l1}'`),
      INTEGRITY,
    );
    await rejectsWith(
      owner.query(
        `UPDATE quote_lines SET line_total_cents = 1, line_material_cents = 1, line_labor_cents = 0 WHERE id = '${l1}'`,
      ),
      INTEGRITY,
    );
    expect(
      (await run(appUser, ctx.admin, `DELETE FROM quote_lines WHERE id = '${l3}'`)).rowCount,
    ).toBe(1);
    const pkg2 = id();
    await owner.query(
      `INSERT INTO packages (id, tier, name, warranty_text, warranty_years, updated_at) VALUES ($1,'BETTER','Mejor','G',10,now())`,
      [pkg2],
    );
    await expect(run(appUser, ctx.admin, newOption(v3, pkg2))).resolves.toMatchObject({
      rowCount: 1,
    });
  });

  it('solo se permiten las transiciones válidas de estado', async () => {
    const move = (version: string, status: string) =>
      owner.query(`UPDATE quote_versions SET status = '${status}' WHERE id = '${version}'`);
    await rejectsWith(move(v3, 'VIEWED'), INTEGRITY); // DRAFT -> VIEWED
    await rejectsWith(move(v1, 'DRAFT'), INTEGRITY); // SENT -> DRAFT
    await rejectsWith(move(v1, 'APPROVED'), '22P02'); // aún no existe en el enum
  });

  it('una versión se envía solo con PDF y hash, y no se borra', async () => {
    await rejectsWith(
      owner.query(
        `UPDATE quote_versions SET status = 'SENT', sent_at = now(), locked_at = now() WHERE id = '${v3}'`,
      ),
      CHECK_VIOLATION,
    );
    await rejectsWith(owner.query(`DELETE FROM quote_versions WHERE id = '${v1}'`), INTEGRITY);
  });

  it('una sola versión en borrador por presupuesto', async () => {
    await rejectsWith(
      owner.query(
        `INSERT INTO quote_versions (id, quote_id, version_number, waste_bps, tax_bps, deposit_bps, measurements_snapshot, created_by_id, updated_at)
         VALUES (gen_random_uuid(), '${q3}', 2, 0, 0, 0, '{}', '${u.admin}', now())`,
      ),
      '23505',
    );
  });
});
