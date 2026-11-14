import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../env.js';

/** Vida máxima de las URL firmadas (decisión T28): 5 minutos. */
export const SIGNED_URL_TTL_SECONDS = 300;

export interface PresignedUpload {
  url: string;
  /** Cabeceras que el cliente debe enviar tal cual con el PUT (están firmadas). */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface StoredObject {
  contentLength: number;
  contentType: string | undefined;
  /** SHA-256 que guardó el almacenamiento, en hexadecimal (si lo devuelve). */
  sha256Hex: string | undefined;
}

/**
 * Almacenamiento de objetos compatible con S3 (Garage en desarrollo; el mismo código servirá
 * con otro proveedor S3 más adelante). Los bytes nunca pasan por la API: solo URL firmadas.
 * En las pruebas se inyecta una implementación falsa (la CI no tiene Garage).
 */
export interface Storage {
  readonly bucket: string;
  /** URL PUT firmada que fija tipo, tamaño y SHA-256: S3 rechaza cualquier otro contenido. */
  presignUpload(input: {
    key: string;
    contentType: string;
    contentLength: number;
    sha256Hex: string;
  }): Promise<PresignedUpload>;
  /** Metadatos del objeto subido, o null si no existe. */
  head(key: string): Promise<StoredObject | null>;
  /** URL GET firmada de vida corta. */
  presignDownload(input: { key: string; downloadName?: string | undefined }): Promise<string>;
}

export function hexToBase64(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64');
}

export function base64ToHex(value: string): string {
  return Buffer.from(value, 'base64').toString('hex');
}

/** Cliente S3 con la configuración de `env`, o null si el almacenamiento no está configurado. */
export function createS3Client(env: Env): S3Client | null {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) return null;
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    // Solo se calculan checksums cuando la operación los exige o los fijamos nosotros.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/** Implementación S3 de `Storage`, o null si falta la configuración (las rutas responden 503). */
export function createS3Storage(env: Env): Storage | null {
  const client = createS3Client(env);
  if (!client) return null;
  const bucket = env.S3_BUCKET;
  return {
    bucket,
    async presignUpload({ key, contentType, contentLength, sha256Hex }) {
      const checksum = hexToBase64(sha256Hex);
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
        ChecksumSHA256: checksum,
      });
      const url = await getSignedUrl(client, command, {
        expiresIn: SIGNED_URL_TTL_SECONDS,
        // Estas cabeceras van firmadas y no en la query: el PUT debe traerlas con estos valores.
        signableHeaders: new Set(['content-type', 'content-length', 'x-amz-checksum-sha256']),
        unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
      });
      return {
        url,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(contentLength),
          'x-amz-checksum-sha256': checksum,
        },
        expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      };
    },
    async head(key) {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: 'ENABLED' }),
        );
        return {
          contentLength: result.ContentLength ?? 0,
          contentType: result.ContentType,
          sha256Hex: result.ChecksumSHA256 ? base64ToHex(result.ChecksumSHA256) : undefined,
        };
      } catch (error) {
        if (error instanceof NotFound || (error as { name?: string }).name === 'NotFound') {
          return null;
        }
        throw error;
      }
    },
    async presignDownload({ key, downloadName }) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(downloadName
          ? {
              ResponseContentDisposition: `inline; filename="${downloadName.replace(/[^\w. -]/g, '_')}"`,
            }
          : {}),
      });
      return getSignedUrl(client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
    },
  };
}
