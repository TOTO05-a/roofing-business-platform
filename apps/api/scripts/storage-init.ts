/**
 * Prepara Garage (almacenamiento S3 de desarrollo, decisión T29) la primera vez: asigna el
 * nodo único al cluster, crea el bucket privado, importa la clave de desarrollo de .env y
 * configura CORS para el origen de la app (el navegador sube con PUT directo a la URL firmada).
 * Es idempotente. Requiere `docker compose up -d garage`. Solo para desarrollo local.
 * Ejecuta: pnpm --filter @roofing/api storage:init
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { parseEnv } from '../src/env.js';
import { createS3Client } from '../src/lib/storage.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

const env = parseEnv({
  // Solo se necesitan las variables S3_*; el resto toma valores de relleno.
  NODE_ENV: 'development',
  APP_DATABASE_URL: 'postgresql://x@localhost/x',
  SYSTEM_DATABASE_URL: 'postgresql://x@localhost/x',
  BETTER_AUTH_SECRET: 'storage-init-sin-uso-0123456789abcdef',
  ...process.env,
});

if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
  throw new Error(
    'Faltan S3_ENDPOINT, S3_ACCESS_KEY_ID o S3_SECRET_ACCESS_KEY (ver .env.example).',
  );
}
if (
  !/^GK[0-9a-f]{24}$/.test(env.S3_ACCESS_KEY_ID) ||
  !/^[0-9a-f]{64}$/.test(env.S3_SECRET_ACCESS_KEY)
) {
  throw new Error(
    'Garage exige S3_ACCESS_KEY_ID = "GK" + 24 hex y S3_SECRET_ACCESS_KEY = 64 hex (ver .env.example).',
  );
}
const { S3_ACCESS_KEY_ID: keyId, S3_SECRET_ACCESS_KEY: secret, S3_BUCKET: bucket } = env;

function garage(...args: string[]): { ok: boolean; out: string } {
  const result = spawnSync('docker', ['compose', 'exec', '-T', 'garage', '/garage', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  });
  return { ok: result.status === 0, out: `${result.stdout}${result.stderr}` };
}

function must(...args: string[]): string {
  const result = garage(...args);
  if (!result.ok) throw new Error(`garage ${args.join(' ')} falló:\n${result.out}`);
  return result.out;
}

// 1. Cluster de un solo nodo.
const status = must('status');
if (!/\bdc1\b/.test(status)) {
  const nodeId = status.match(/^([0-9a-f]{16})\s/m)?.[1];
  if (!nodeId) throw new Error(`No pude leer el id del nodo:\n${status}`);
  must('layout', 'assign', '-z', 'dc1', '-c', '1G', nodeId);
  must('layout', 'apply', '--version', '1');
  console.log('Cluster de un nodo configurado.');
}

// 2. Bucket privado.
if (!garage('bucket', 'info', bucket).ok) {
  must('bucket', 'create', bucket);
  console.log(`Bucket ${bucket} creado (privado).`);
}

// 3. Clave de desarrollo y permisos solo sobre ese bucket.
if (!garage('key', 'info', keyId).ok) {
  must('key', 'import', '--yes', '-n', 'roofing-dev', keyId, secret);
  console.log('Clave de desarrollo importada.');
}
must('bucket', 'allow', '--read', '--write', '--owner', bucket, '--key', keyId);

// 4. CORS: el navegador sube directo a la URL firmada desde el origen de la app.
const client = createS3Client(env);
if (!client) throw new Error('No se pudo crear el cliente S3');
await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [...new Set([env.APP_URL, ...env.TRUSTED_ORIGINS])],
          AllowedMethods: ['PUT', 'GET', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 600,
        },
      ],
    },
  }),
);
console.log(`Garage listo: ${env.S3_ENDPOINT}, bucket ${bucket}.`);
