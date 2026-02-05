/**
 * Cloudflare R2 Storage Provider
 *
 * R2 is S3-compatible, so we use the AWS SDK for all operations.
 * This provides same-network performance with Cloudflare Image Resizing.
 *
 * Setup:
 * 1. Create R2 bucket in Cloudflare dashboard
 * 2. Create R2 API token with read/write permissions
 * 3. Connect custom domain (e.g., cdn.dalat.app) for public access
 * 4. Set environment variables (see r2-config.ts)
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  StorageProvider,
  UploadOptions,
  PresignedUrlOptions,
} from './index';
import { getR2ConfigOrThrow } from './r2-config';

const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Create S3 client for R2
 */
function createR2Client(): S3Client {
  const config = getR2ConfigOrThrow();

  return new S3Client({
    region: 'auto', // R2 uses 'auto' region
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export class R2StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucketName: string;
  private publicUrl: string;

  constructor() {
    const config = getR2ConfigOrThrow();
    this.client = createR2Client();
    this.bucketName = config.bucketName;
    this.publicUrl = config.publicUrl;
  }

  /**
   * Upload a file to R2
   * Path format: {bucket}/{path} where bucket is the logical bucket name
   * (e.g., 'avatars/user123/avatar.jpg' for avatars bucket)
   */
  async upload(
    bucket: string,
    path: string,
    file: Buffer | Blob,
    options?: UploadOptions
  ): Promise<string> {
    const key = `${bucket}/${path}`;

    // Convert Blob to Buffer if needed
    const body = file instanceof Blob ? Buffer.from(await file.arrayBuffer()) : file;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: options?.contentType || 'application/octet-stream',
        CacheControl: options?.cacheControl || DEFAULT_CACHE_CONTROL,
      })
    );

    return this.getPublicUrl(bucket, path);
  }

  /**
   * Get public URL for a file
   * Format: https://cdn.dalat.app/{bucket}/{path}
   */
  getPublicUrl(bucket: string, path: string): string {
    return `${this.publicUrl}/${bucket}/${path}`;
  }

  /**
   * Delete a file from R2
   */
  async delete(bucket: string, path: string): Promise<void> {
    const key = `${bucket}/${path}`;

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      })
    );
  }

  /**
   * Create a presigned URL for direct browser upload
   * This allows clients to upload directly to R2 without going through the server.
   */
  async createPresignedUploadUrl(
    bucket: string,
    path: string,
    options?: PresignedUrlOptions
  ): Promise<string> {
    const key = `${bucket}/${path}`;
    const expiresIn = options?.expiresIn || 3600; // 1 hour default

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: options?.contentType,
      CacheControl: DEFAULT_CACHE_CONTROL,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }
}
