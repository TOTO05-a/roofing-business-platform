#!/usr/bin/env node
/**
 * Levanta la demo local con un solo comando (ver COMO-INICIAR.md y CREDENCIALES.md).
 *
 *   pnpm demo            prepara todo y arranca web, app y API
 *   pnpm demo:preparar   solo prepara (contenedores, migraciones, roles, almacenamiento y seed)
 *
 * Solo para desarrollo local: usa los valores de PRUEBA de los .env.example.
 * Nunca escribe contraseñas reales ni toca servicios externos.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const soloPreparar = process.argv.includes('--solo-preparar');
const shell = process.platform === 'win32';

// Valores de prueba del seed demo (los mismos que documenta apps/api/.env.example).
const DEMO_ENV = {
  SEED_DEMO: 'true',
  SEED_SUPERADMIN_EMAIL: 'superadmin@cresta-roofing.example',
  SEED_SUPERADMIN_PASSWORD: 'Demo-Superadmin-2026',
  SEED_SUPERADMIN_NAME: 'Sergio Demo',
  SEED_DEMO_CUSTOMER_PASSWORD: 'Demo-Cliente-2026',
  SEED_DEMO_EMPLOYEE_PASSWORD: 'Demo-Empleado-2026',
  SEED_DEMO_ADMIN_PASSWORD: 'Demo-Admin-2026!',
  SEED_DEMO_SUPERADMIN_PASSWORD: 'Demo-Superadmin-2026',
};

function paso(texto) {
  console.log(`\n▶ ${texto}`);
}

function ejecutar(comando, args, { reintentos = 0 } = {}) {
  for (let intento = 0; intento <= reintentos; intento++) {
    const r = spawnSync(comando, args, { stdio: 'inherit', shell });
    if (r.status === 0) return;
    if (intento < reintentos) {
      console.log(`  Reintentando (${intento + 1}/${reintentos})...`);
      spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},3000)']);
    }
  }
  console.error(
    `\n✖ Falló: ${comando} ${args.join(' ')}\n  Consulta «Si algo falla» en COMO-INICIAR.md.`,
  );
  process.exit(1);
}

/**
 * Copia el .env.example si falta; si existe, añade las variables nuevas del ejemplo que no tenga
 * (sin tocar las que ya tiene). Después rellena solo las variables vacías de `valores`.
 */
function prepararEnv(destino, ejemplo, valores) {
  if (!existsSync(destino)) {
    copyFileSync(ejemplo, destino);
    console.log(`  Creado ${destino} a partir de ${ejemplo}`);
  }
  let texto = readFileSync(destino, 'utf8');
  const faltan = [];
  for (const linea of readFileSync(ejemplo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=/);
    if (m && !new RegExp(`^${m[1]}=`, 'm').test(texto)) faltan.push(linea);
  }
  if (faltan.length > 0) {
    texto += `\n# Añadidas por pnpm demo desde ${ejemplo}\n${faltan.join('\n')}\n`;
    console.log(`  ${destino}: añadidas ${faltan.length} variables nuevas del ejemplo`);
  }
  for (const [clave, valor] of Object.entries(valores)) {
    const linea = new RegExp(`^${clave}=(.*)$`, 'm');
    const actual = texto.match(linea);
    if (!actual) texto += `\n${clave}=${valor}\n`;
    else if (actual[1].trim() === '' || (clave === 'SEED_DEMO' && actual[1].trim() === 'false'))
      texto = texto.replace(linea, `${clave}=${valor}`);
  }
  writeFileSync(destino, texto);
}

paso('Archivos .env (solo valores locales de prueba)');
prepararEnv('.env', '.env.example', {});
prepararEnv('apps/api/.env', 'apps/api/.env.example', DEMO_ENV);
{
  // Sustituye el secreto de ejemplo por uno aleatorio propio de esta máquina.
  const texto = readFileSync('apps/api/.env', 'utf8');
  if (/^BETTER_AUTH_SECRET=cambia-esto/m.test(texto)) {
    writeFileSync(
      'apps/api/.env',
      texto.replace(
        /^BETTER_AUTH_SECRET=.*$/m,
        `BETTER_AUTH_SECRET=${randomBytes(32).toString('base64')}`,
      ),
    );
  }
}

paso('Contenedores: PostgreSQL, Mailpit y Garage (Docker Desktop debe estar abierto)');
ejecutar('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'mailpit', 'garage']);
{
  // Si otro proyecto ocupa el puerto, el contenedor arranca pero sin publicar el puerto y la
  // demo acabaría usando otra base de datos.
  const r = spawnSync('docker', ['compose', 'port', 'postgres', '5432'], {
    encoding: 'utf8',
    shell,
  });
  if (r.status !== 0 || !r.stdout.trim()) {
    console.error(
      '\n✖ El puerto 5432 lo ocupa otro contenedor o programa, así que la base de datos de este\n' +
        '  proyecto no es accesible. Mira cuál con `docker ps`, detenlo (`docker stop <nombre>`) y\n' +
        '  ejecuta `docker compose up -d --force-recreate postgres mailpit`. Ver COMO-INICIAR.md.',
    );
    process.exit(1);
  }
}

paso('Cliente de Prisma');
ejecutar('pnpm', ['--filter', '@roofing/api', 'db:generate']);

paso('Migraciones de la base de datos');
ejecutar('pnpm', ['--filter', '@roofing/api', 'db:deploy'], { reintentos: 3 });

paso('Contraseñas de los roles de la API');
ejecutar('pnpm', ['--filter', '@roofing/api', 'db:roles']);

paso('Almacenamiento de fotos (Garage)');
ejecutar('pnpm', ['--filter', '@roofing/api', 'storage:init'], { reintentos: 3 });

paso('Datos y usuarios de demostración');
ejecutar('pnpm', ['--filter', '@roofing/api', 'db:seed']);

console.log('\n✔ Demo preparada. Usuarios y contraseñas: CREDENCIALES.md');
if (soloPreparar) process.exit(0);

paso('Arrancando web (4321), app (5173) y API (3000). Ctrl+C para detener.');
ejecutar('pnpm', ['dev']);
