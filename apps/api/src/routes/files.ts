import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { authContext, currentUser, requireAuth } from '../auth/middleware.js';
import { scopedWhere, visibleOr404 } from '../auth/scope.js';
import { recordAudit, requestMeta } from '../lib/audit.js';
import { HttpError } from '../lib/http-error.js';
import { rlsTransaction } from '../lib/rls.js';
import { idParamsSchema, optionalText } from '../lib/schemas.js';
import { SIGNED_URL_TTL_SECONDS, type Storage } from '../lib/storage.js';
import { parseInput } from '../lib/validation.js';
import type { AppServices } from '../services.js';
import { draftInspectionOr404 } from './inspections.js';

/** Tipos de imagen permitidos (los mismos que el CHECK `files_mime_chk`) y su extensión. */
export const ALLOWED_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
} as const;
type AllowedMime = keyof typeof ALLOWED_MIME_TYPES;
const MIME_LIST = Object.keys(ALLOWED_MIME_TYPES) as [AllowedMime, ...AllowedMime[]];

/** Tamaño máximo de una foto: 25 MB (el CHECK `files_size_chk` aplica el mismo límite). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const uploadSchema = z
  .object({
    mimeType: z.enum(MIME_LIST, { error: 'Tipo de archivo no permitido (JPEG, PNG, WebP o HEIC)' }),
    sizeBytes: z.number().int().min(1).max(MAX_FILE_BYTES, 'El archivo supera los 25 MB'),
    sha256: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[0-9a-f]{64}$/, 'sha256 debe ser hexadecimal de 64 caracteres'),
    originalName: optionalText(255),
  })
  .strict();

const completeSchema = z
  .object({
    sectionId: z.uuid().optional(),
    caption: optionalText(500),
    takenAt: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
  })
  .strict();

function requireStorage(storage: Storage | null): Storage {
  if (!storage) {
    throw new HttpError(
      503,
      'STORAGE_NOT_CONFIGURED',
      'El almacenamiento de archivos no está configurado',
    );
  }
  return storage;
}

/**
 * Fotos de inspección con URL firmadas (T28): la API nunca recibe los bytes. Flujo:
 * 1) crear la subida (File PENDING + URL PUT firmada), 2) el cliente sube directo a S3,
 * 3) completar (HeadObject comprueba tamaño, tipo y SHA-256; File READY + InspectionPhoto),
 * 4) descargar con una URL GET firmada emitida solo tras encontrar el File bajo RLS.
 */
export function filesRouter(services: AppServices): Router {
  const { db } = services;
  const router = Router();
  const authed = requireAuth(services);

  router.post('/inspections/:id/photos/uploads', authed, async (req, res) => {
    const storage = requireStorage(services.storage);
    const actor = currentUser(req);
    const context = authContext(req);
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(uploadSchema, req.body);
    if (context.role === 'CUSTOMER') {
      throw new HttpError(403, 'FORBIDDEN', 'No tienes permiso para esta acción');
    }
    const objectKey = `inspections/${id}/${randomUUID()}.${ALLOWED_MIME_TYPES[input.mimeType]}`;
    const file = await rlsTransaction(db, context, async (tx) => {
      await draftInspectionOr404(tx, context, id);
      const created = await tx.file.create({
        data: {
          bucket: storage.bucket,
          objectKey,
          mimeType: input.mimeType,
          sizeBytes: BigInt(input.sizeBytes),
          sha256: input.sha256,
          originalName: input.originalName ?? null,
          uploadedById: actor.id,
        },
        select: { id: true },
      });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'file.upload.create',
        entityType: 'file',
        entityId: created.id,
        after: { inspectionId: id, mimeType: input.mimeType, sizeBytes: input.sizeBytes },
        ...requestMeta(req),
      });
      return created;
    });
    const upload = await storage.presignUpload({
      key: objectKey,
      contentType: input.mimeType,
      contentLength: input.sizeBytes,
      sha256Hex: input.sha256,
    });
    res.status(201).json({ file: { id: file.id, status: 'PENDING' }, upload });
  });

  router.post('/inspections/:id/photos/:fileId/complete', authed, async (req, res) => {
    const storage = requireStorage(services.storage);
    const actor = currentUser(req);
    const context = authContext(req);
    const { id, fileId } = parseInput(z.object({ id: z.uuid(), fileId: z.uuid() }), req.params);
    const input = parseInput(completeSchema, req.body ?? {});
    const photo = await rlsTransaction(db, context, async (tx) => {
      await draftInspectionOr404(tx, context, id);
      const file = visibleOr404(
        await tx.file.findFirst({
          where: scopedWhere('file', context, { id: fileId, uploadedById: actor.id }),
        }),
      );
      if (!file.objectKey.startsWith(`inspections/${id}/`)) {
        throw new HttpError(404, 'NOT_FOUND', 'Recurso no encontrado');
      }
      if (file.status !== 'PENDING') {
        throw new HttpError(409, 'FILE_NOT_PENDING', 'La subida ya se completó');
      }
      if (input.sectionId) {
        visibleOr404(
          await tx.inspectionSection.findFirst({
            where: { id: input.sectionId, inspectionId: id },
            select: { id: true },
          }),
        );
      }
      const stored = await storage.head(file.objectKey);
      if (!stored) {
        throw new HttpError(409, 'UPLOAD_MISSING', 'Todavía no se ha subido el archivo');
      }
      const problems: string[] = [];
      if (stored.contentLength !== Number(file.sizeBytes)) problems.push('size');
      if (stored.contentType !== file.mimeType) problems.push('contentType');
      if (stored.sha256Hex?.toLowerCase() !== file.sha256) problems.push('sha256');
      if (problems.length > 0) {
        throw new HttpError(
          409,
          'UPLOAD_MISMATCH',
          'El archivo subido no coincide con lo declarado',
          { problems },
        );
      }
      const ready = await tx.file.updateMany({
        where: { id: fileId, status: 'PENDING' },
        data: { status: 'READY' },
      });
      if (ready.count === 0) {
        throw new HttpError(409, 'FILE_NOT_PENDING', 'La subida ya se completó');
      }
      const created = await tx.inspectionPhoto.create({
        data: {
          inspectionId: id,
          fileId,
          ...(input.sectionId ? { sectionId: input.sectionId } : {}),
          ...(input.caption ? { caption: input.caption } : {}),
          ...(input.takenAt ? { takenAt: input.takenAt } : {}),
        },
        select: {
          id: true,
          inspectionId: true,
          sectionId: true,
          fileId: true,
          caption: true,
          takenAt: true,
        },
      });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'file.upload.complete',
        entityType: 'file',
        entityId: fileId,
        after: { inspectionId: id, photoId: created.id },
        ...requestMeta(req),
      });
      return created;
    });
    res.status(201).json({ photo });
  });

  router.get('/files/:id/download', authed, async (req, res) => {
    const storage = requireStorage(services.storage);
    const context = authContext(req);
    const { id } = parseInput(idParamsSchema, req.params);
    // Primero se busca el File bajo RLS: sin visibilidad, 404 y no se firma nada.
    const file = visibleOr404(
      await rlsTransaction(db, context, (tx) =>
        tx.file.findFirst({
          where: scopedWhere('file', context, { id, status: 'READY' }),
          select: { objectKey: true, mimeType: true, originalName: true },
        }),
      ),
    );
    const url = await storage.presignDownload({
      key: file.objectKey,
      downloadName: file.originalName ?? undefined,
    });
    res.json({ url, mimeType: file.mimeType, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
  });

  return router;
}
