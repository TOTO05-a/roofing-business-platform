import { api } from '../api/client';
import type { PresignedUpload } from '../api/types';

export const ALLOWED_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

export type UploadStage = 'preparing' | 'uploading' | 'finishing';

export function validatePhoto(file: {
  type: string;
  size: number;
}): 'fileType' | 'fileSize' | null {
  if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(file.type)) return 'fileType';
  if (file.size > MAX_PHOTO_BYTES) return 'fileSize';
  return null;
}

/** SHA-256 en hexadecimal (la API lo exige y comprueba el archivo subido). */
export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** PUT a la URL firmada con progreso (XHR: `fetch` no informa de la subida). */
export function putWithProgress(
  upload: PresignedUpload,
  file: Blob,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', upload.url);
    for (const [name, value] of Object.entries(upload.headers)) {
      // El navegador fija solo `Content-Length`.
      if (name.toLowerCase() !== 'content-length') xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('UPLOAD_FAILED'));
    xhr.onerror = () => reject(new Error('UPLOAD_FAILED'));
    xhr.send(file);
  });
}

export interface UploadOptions {
  sectionId?: string | undefined;
  onStage: (stage: UploadStage) => void;
  onProgress: (fraction: number) => void;
}

/** Flujo T28: pedir la URL firmada, subir directo al almacenamiento y confirmar con la API. */
export async function uploadInspectionPhoto(
  inspectionId: string,
  file: File,
  options: UploadOptions,
): Promise<void> {
  options.onStage('preparing');
  const sha256 = await sha256Hex(file);
  const created = await api<{ file: { id: string }; upload: PresignedUpload }>(
    `/api/inspections/${inspectionId}/photos/uploads`,
    {
      method: 'POST',
      body: { mimeType: file.type, sizeBytes: file.size, sha256, originalName: file.name },
    },
  );
  options.onStage('uploading');
  await putWithProgress(created.upload, file, options.onProgress);
  options.onStage('finishing');
  await api(`/api/inspections/${inspectionId}/photos/${created.file.id}/complete`, {
    method: 'POST',
    body: options.sectionId ? { sectionId: options.sectionId } : {},
  });
}
