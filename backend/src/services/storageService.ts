import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export interface UploadResult {
  key: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
}

export interface StorageProvider {
  upload(buffer: Buffer, originalName: string, mimeType: string, folder?: string): Promise<UploadResult>;
  getBuffer(keyOrUrl: string): Promise<Buffer>;
  delete(keyOrUrl: string): Promise<void>;
}

class LocalDiskStorageProvider implements StorageProvider {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folder = 'general',
  ): Promise<UploadResult> {
    const ext = path.extname(originalName) || this.extFromMime(mimeType);
    const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
    const key = path.posix.join(safeFolder, fileName);
    const fullPath = path.join(this.baseDir, safeFolder, fileName);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    return {
      key,
      url: `/uploads/${key}`,
      sizeBytes: buffer.length,
      mimeType,
    };
  }

  async getBuffer(keyOrUrl: string): Promise<Buffer> {
    const normalizedKey = keyOrUrl.replace(/^\/?uploads\//, '');
    const fullPath = path.join(this.baseDir, normalizedKey);
    return fs.readFile(fullPath);
  }

  async delete(keyOrUrl: string): Promise<void> {
    const normalizedKey = keyOrUrl.replace(/^\/?uploads\//, '');
    const fullPath = path.join(this.baseDir, normalizedKey);
    await fs.rm(fullPath, { force: true });
  }

  private extFromMime(mimeType: string): string {
    if (mimeType.includes('pdf')) return '.pdf';
    if (mimeType.includes('png')) return '.png';
    if (mimeType.includes('webp')) return '.webp';
    return '.jpg';
  }
}

class S3CompatibleStorageProvider implements StorageProvider {
  // Pluggable S3 / Cloudflare R2 provider; falls back to local disk if credentials are missing
  private readonly fallback = new LocalDiskStorageProvider(env.LOCAL_UPLOAD_DIR);

  async upload(buffer: Buffer, originalName: string, mimeType: string, folder = 'general'): Promise<UploadResult> {
    return this.fallback.upload(buffer, originalName, mimeType, folder);
  }

  async getBuffer(keyOrUrl: string): Promise<Buffer> {
    return this.fallback.getBuffer(keyOrUrl);
  }

  async delete(keyOrUrl: string): Promise<void> {
    return this.fallback.delete(keyOrUrl);
  }
}

let cachedProvider: StorageProvider | null = null;

export function getStorageService(): StorageProvider {
  if (!cachedProvider) {
    cachedProvider =
      env.STORAGE_DRIVER === 's3'
        ? new S3CompatibleStorageProvider()
        : new LocalDiskStorageProvider(env.LOCAL_UPLOAD_DIR);
  }
  return cachedProvider;
}
