import type { PresignedUpload, Storage, StoredObject } from '../../src/lib/storage.js';

export interface PresignCall {
  key: string;
  contentType: string;
  contentLength: number;
  sha256Hex: string;
}

/** Almacenamiento falso en memoria: la CI no tiene Garage. */
export class FakeStorage implements Storage {
  readonly bucket = 'test-bucket';
  readonly objects = new Map<string, StoredObject>();
  readonly uploads: PresignCall[] = [];
  readonly downloads: string[] = [];

  async presignUpload(input: PresignCall): Promise<PresignedUpload> {
    this.uploads.push(input);
    return {
      url: `http://storage.test/${input.key}?signature=fake`,
      headers: {
        'Content-Type': input.contentType,
        'Content-Length': String(input.contentLength),
        'x-amz-checksum-sha256': Buffer.from(input.sha256Hex, 'hex').toString('base64'),
      },
      expiresInSeconds: 300,
    };
  }

  async head(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async presignDownload(input: { key: string }): Promise<string> {
    this.downloads.push(input.key);
    return `http://storage.test/${input.key}?download=fake`;
  }

  /** Simula que el navegador subió el objeto de la última URL firmada (o uno alterado). */
  simulateUpload(key: string, override: Partial<StoredObject> = {}): void {
    const call = this.uploads.find((upload) => upload.key === key);
    if (!call) throw new Error(`No se firmó ninguna subida para ${key}`);
    this.objects.set(key, {
      contentLength: call.contentLength,
      contentType: call.contentType,
      sha256Hex: call.sha256Hex,
      ...override,
    });
  }
}
