import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';

export type FileUploadScope = 'driver' | 'vehicle' | 'organization';

export type CreateUploadSlotInput = {
  scope: FileUploadScope;
  ownerId: string;
  documentType: string;
  filename?: string;
};

@Injectable()
export class FileService {
  constructor(private readonly config: ConfigService) {}

  createUploadSlot(input: CreateUploadSlotInput) {
    const fileUuid = randomBytes(12).toString('hex');
    const bucket = this.config.get<string>('FILE_BUCKET') ?? 'moveos-documents';
    const publicBaseUrl = (this.config.get<string>('FILE_PUBLIC_BASE_URL') ?? 'https://storage.pahadi.app').replace(/\/$/, '');
    const uploadBaseUrl = (this.config.get<string>('FILE_UPLOAD_BASE_URL') ?? `${publicBaseUrl}/upload`).replace(/\/$/, '');
    const safeFilename = encodeURIComponent(input.filename || `${input.documentType}.bin`);
    const objectKey = `${input.scope}/${input.ownerId}/${input.documentType}/${fileUuid}/${safeFilename}`;

    return {
      fileUuid,
      bucket,
      objectKey,
      uploadUrl: `${uploadBaseUrl}/${objectKey}`,
      fileUrl: `${publicBaseUrl}/${objectKey}`,
      expiresInSeconds: 900,
    };
  }

  async saveUploadedFile(input: CreateUploadSlotInput & { buffer: Buffer; mimetype?: string }) {
    const slot = this.createUploadSlot(input);
    const root = this.config.get<string>('FILE_STORAGE_ROOT') ?? join(process.cwd(), 'uploads');
    const filePath = join(root, slot.objectKey);
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.buffer);
    const apiBaseUrl = (this.config.get<string>('API_PUBLIC_BASE_URL') ?? 'http://localhost:3000/api').replace(/\/$/, '');
    return {
      ...slot,
      mimeType: input.mimetype,
      fileUrl: `${apiBaseUrl}/files/public/${slot.objectKey}`,
    };
  }

  async resolveLocalObjectPath(objectKey: string) {
    const root = this.config.get<string>('FILE_STORAGE_ROOT') ?? join(process.cwd(), 'uploads');
    return join(root, objectKey);
  }
}
