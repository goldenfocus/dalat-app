/**
 * Client-side Storage Utilities
 *
 * Provides a unified interface for uploading files from the browser.
 * Automatically uses presigned URLs when R2 is configured.
 *
 * Key features:
 * - Automatic retry with exponential backoff (critical for iOS Safari)
 * - Presigned URL uploads for better performance
 * - Resumable uploads via tus protocol for large files
 * - Fallback to direct Supabase upload if presign fails
 */

import { createClient } from "@/lib/supabase/client";
import { generateSmartFilename } from "@/lib/media-utils";
import { multipartUpload } from "./multipart-upload";

// Retry configuration for upload resilience
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds
const MULTIPART_THRESHOLD = 10 * 1024 * 1024; // 10MB - use multipart above this

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
function getRetryDelay(attempt: number): number {
  const baseDelay = Math.min(
    INITIAL_RETRY_DELAY * Math.pow(2, attempt),
    MAX_RETRY_DELAY
  );
  // Add 0-25% random jitter to prevent thundering herd
  const jitter = baseDelay * Math.random() * 0.25;
  return Math.round(baseDelay + jitter);
}

/**
 * Check if an error is retryable (network failures, timeouts, etc.)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // These indicate network/transient issues that may succeed on retry
    return (
      message.includes("load failed") || // iOS Safari network failure
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("fetch") ||
      message.includes("aborted") ||
      message.includes("connection") ||
      message.includes("econnreset") ||
      message.includes("socket hang up")
    );
  }
  return false;
}

/**
 * Fetch with automatic retry for transient failures.
 * @param timeoutMs Per-attempt timeout in ms. 0 = no timeout. Default 0.
 *   Use for server API calls (presign) but NOT for large file uploads.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = MAX_RETRIES,
  timeoutMs = 0
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let controller: AbortController | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs > 0) {
      controller = new AbortController();
      timeoutId = setTimeout(() => controller!.abort(), timeoutMs);
    }

    try {
      const response = await fetch(url, {
        ...options,
        ...(controller && { signal: controller.signal }),
      });

      if (timeoutId) clearTimeout(timeoutId);

      // Don't retry client errors (4xx) - they won't succeed on retry
      // Do retry server errors (5xx) - they might be transient
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // Server error - might be worth retrying
      if (attempt < maxRetries) {
        const delay = getRetryDelay(attempt);
        console.log(
          `[Upload] Server error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      // Out of retries
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));

      // If it's a retryable error and we have retries left, try again
      if (isRetryableError(error) && attempt < maxRetries) {
        const delay = getRetryDelay(attempt);
        console.log(
          `[Upload] Retryable error: ${lastError.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      // Non-retryable error or out of retries
      throw lastError;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error("Upload failed after retries");
}

/**
 * Infer MIME type from file extension (fallback for iOS Safari issues)
 */
function inferContentType(file: File): string {
  // Return existing type if valid
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }

  // Infer from extension
  const ext = file.name.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    pdf: "application/pdf",
    mp3: "audio/mpeg",
    m4a: "audio/x-m4a",
    wav: "audio/wav",
    ogg: "audio/ogg",
  };

  return mimeMap[ext || ""] || file.type || "application/octet-stream";
}

export interface UploadResult {
  publicUrl: string;
  path: string;
  provider: "r2" | "supabase";
}

export interface UploadOptions {
  /** Entity ID for path generation (e.g., organizerId, eventId) */
  entityId?: string;
  /** Custom filename (auto-generated if not provided) */
  filename?: string;
  /** Callback for upload progress (0-100) */
  onProgress?: (progress: number) => void;
}

/**
 * Upload a file to storage (R2 or Supabase)
 *
 * This function automatically:
 * 1. Checks if R2 is configured via the presign API
 * 2. Uses presigned URLs for R2, direct upload for Supabase
 * 3. Returns the public URL of the uploaded file
 *
 * HEIC files are uploaded as-is to R2. The caller is responsible for
 * triggering server-side conversion via /api/convert-heic-r2 afterward.
 */
export async function uploadFile(
  bucket: string,
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const entityId = options.entityId || `temp-${Date.now()}`;
  const fileExt = ext || "jpg";
  const path =
    options.filename || generateSmartFilename(file.name, entityId, fileExt);

  // Infer content type (handles iOS Safari MIME type issues)
  const contentType = inferContentType(file);

  // Large files: use multipart upload (chunked, parallel, resumable per-chunk)
  if (file.size > MULTIPART_THRESHOLD) {
    try {
      return await multipartUpload({
        bucket,
        file,
        path,
        contentType,
        onProgress: options.onProgress,
      });
    } catch (error) {
      // Never swallow user cancellation
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      // Only fall back to single PUT if R2 is not configured
      const isR2Unavailable =
        error instanceof Error && error.message.includes("R2 storage not configured");
      if (!isR2Unavailable) {
        throw error;
      }
      console.warn("[Upload] R2 not configured, falling back to single PUT");
    }
  }

  // Upload via R2 presigned URL (no Supabase fallback — all uploads go through R2)
  const presignResponse = await fetchWithRetry(
    "/api/storage/presign",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket,
        path,
        contentType,
      }),
    },
    2, // Fewer retries for presign - it's quick and failures are usually auth issues
    15000 // 15s timeout per attempt — fail fast instead of hanging if server is down
  );

  if (!presignResponse.ok) {
    const errorText = await presignResponse.text().catch(() => "unknown");
    throw new Error(`Presign failed (${presignResponse.status}): ${errorText}`);
  }

  const { url, publicUrl, provider } = await presignResponse.json();

  // Read file into memory before uploading to prevent ERR_FILE_NOT_FOUND.
  // During large batch uploads (100+ files), browser may GC the File handle
  // before the PUT executes, causing the request body to be unreadable.
  const fileBuffer = await file.arrayBuffer();
  const fileBlob = new Blob([fileBuffer], { type: contentType });

  // Upload directly to the presigned URL with retry
  // This is the critical path where iOS "Load failed" errors happen
  const uploadResponse = await fetchWithRetry(
    url,
    {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      body: fileBlob,
    },
    MAX_RETRIES // Full retries for the actual upload
  );

  if (!uploadResponse.ok) {
    throw new Error(`R2 upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
  }

  return { publicUrl, path, provider };
}

/**
 * Delete a file from storage
 *
 * @param bucket Storage bucket name
 * @param urlOrPath Full URL or path of the file to delete
 */
export async function deleteFile(
  bucket: string,
  urlOrPath: string
): Promise<void> {
  // Extract path from URL if needed
  let path = urlOrPath;

  // Handle Supabase URLs
  if (urlOrPath.includes(`/${bucket}/`)) {
    path = urlOrPath.split(`/${bucket}/`)[1] || urlOrPath;
  }

  // Handle R2 URLs (cdn.dalat.app/{bucket}/{path})
  if (urlOrPath.includes("cdn.dalat.app")) {
    const match = urlOrPath.match(/cdn\.dalat\.app\/[^/]+\/(.+)/);
    if (match) {
      path = match[1];
    }
  }

  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    // If Supabase delete fails, try R2 via API
    // For now, just log the error - R2 delete would need a separate endpoint
    console.warn("Delete may have failed:", error);
  }
}

/**
 * Check if storage is configured for a bucket
 */
export async function getStorageInfo(): Promise<{
  r2Configured: boolean;
  buckets: string[];
}> {
  try {
    const response = await fetch("/api/storage/presign");
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Ignore errors
  }
  return { r2Configured: false, buckets: [] };
}

// Note: For large video uploads, use Cloudflare Stream instead of Supabase Storage.
// The bulk uploader uses TUS protocol to upload videos directly to Cloudflare Stream
// via the /api/moments/upload-video endpoint. This provides:
// - Adaptive bitrate streaming (HLS)
// - Automatic thumbnail generation
// - No file size limits for videos
// - Better performance for viewers worldwide
