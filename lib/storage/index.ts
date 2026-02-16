/**
 * Unified Storage Abstraction Layer
 *
 * Provides a consistent interface for uploading files to either
 * Supabase Storage or Cloudflare R2. This allows gradual migration
 * of storage buckets from Supabase to R2 for better performance.
 *
 * R2 benefits:
 * - Same-network with Cloudflare Image Resizing (faster first-request)
 * - Zero egress fees
 * - 200+ edge PoPs worldwide
 */

export interface UploadOptions {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
}

export interface PresignedUrlOptions {
  contentType?: string;
  expiresIn?: number; // seconds, default 3600
}

export interface StorageProvider {
  /**
   * Upload a file to storage
   * @returns Public URL of the uploaded file
   */
  upload(
    bucket: string,
    path: string,
    file: Buffer | Blob,
    options?: UploadOptions
  ): Promise<string>;

  /**
   * Get the public URL for a file
   */
  getPublicUrl(bucket: string, path: string): string;

  /**
   * Delete a file from storage
   */
  delete(bucket: string, path: string): Promise<void>;

  /**
   * Create a presigned URL for direct browser upload
   * @returns Presigned upload URL
   */
  createPresignedUploadUrl(
    bucket: string,
    path: string,
    options?: PresignedUrlOptions
  ): Promise<string>;
}

// === Multipart Upload Types ===

export interface CompletedUploadPart {
  partNumber: number;
  etag: string;
}

export interface PresignedPartUrlOptions {
  expiresIn?: number;
}

export interface MultipartUploadInitResult {
  uploadId: string;
  key: string;
}

export interface MultipartUploadCompleteResult {
  location: string;
  publicUrl: string;
}

export interface MultipartStorageProvider extends StorageProvider {
  createMultipartUpload(
    bucket: string,
    path: string,
    contentType: string
  ): Promise<MultipartUploadInitResult>;

  createPresignedPartUrl(
    bucket: string,
    path: string,
    uploadId: string,
    partNumber: number,
    options?: PresignedPartUrlOptions
  ): Promise<string>;

  createPresignedPartUrls(
    bucket: string,
    path: string,
    uploadId: string,
    partNumbers: number[],
    options?: PresignedPartUrlOptions
  ): Promise<Array<{ partNumber: number; url: string }>>;

  completeMultipartUpload(
    bucket: string,
    path: string,
    uploadId: string,
    parts: CompletedUploadPart[]
  ): Promise<MultipartUploadCompleteResult>;

  abortMultipartUpload(
    bucket: string,
    path: string,
    uploadId: string
  ): Promise<void>;
}

/**
 * All storage buckets now use R2 for maximum performance.
 * R2 is same-network with Cloudflare Image Resizing = faster everything.
 */
const R2_ENABLED_BUCKETS: string[] = [
  'avatars',
  'event-media',
  'moments',
  'venue-media',
  'organizer-logos',
  'persona-references',
  'moment-materials',
  'promo-media',
];

// Import and re-export isR2Configured from centralized config (with .trim() protection)
import { isR2Configured } from './r2-config';
export { isR2Configured };

/**
 * Get the appropriate storage provider for a bucket.
 * Uses R2 for buckets in the enabled list (if R2 is configured),
 * falls back to Supabase Storage otherwise.
 */
export async function getStorageProvider(
  bucket: string
): Promise<StorageProvider> {
  const useR2 = R2_ENABLED_BUCKETS.includes(bucket) && isR2Configured();

  if (useR2) {
    const { R2StorageProvider } = await import('./r2');
    return new R2StorageProvider();
  }

  const { SupabaseStorageProvider } = await import('./supabase');
  return new SupabaseStorageProvider();
}

/**
 * Enable R2 for a bucket at runtime (for testing/gradual rollout)
 */
export function enableR2ForBucket(bucket: string): void {
  if (!R2_ENABLED_BUCKETS.includes(bucket)) {
    R2_ENABLED_BUCKETS.push(bucket);
  }
}

/**
 * Disable R2 for a bucket (rollback)
 */
export function disableR2ForBucket(bucket: string): void {
  const index = R2_ENABLED_BUCKETS.indexOf(bucket);
  if (index > -1) {
    R2_ENABLED_BUCKETS.splice(index, 1);
  }
}

/**
 * Get list of R2-enabled buckets
 */
export function getR2EnabledBuckets(): string[] {
  return [...R2_ENABLED_BUCKETS];
}
