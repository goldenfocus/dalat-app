/**
 * Client-side Storage Utilities
 *
 * Provides a unified interface for uploading files from the browser.
 * Automatically uses presigned URLs when R2 is configured.
 */

import { createClient } from "@/lib/supabase/client";
import { generateSmartFilename } from "@/lib/media-utils";

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
 */
export async function uploadFile(
  bucket: string,
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const entityId = options.entityId || `temp-${Date.now()}`;
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path =
    options.filename || generateSmartFilename(file.name, entityId, ext);

  // Infer content type (handles iOS Safari MIME type issues)
  const contentType = inferContentType(file);

  // Try presigned URL first (works for both R2 and Supabase)
  try {
    const presignResponse = await fetch("/api/storage/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket,
        path,
        contentType,
      }),
    });

    if (presignResponse.ok) {
      const { url, publicUrl, provider } = await presignResponse.json();

      // Upload directly to the presigned URL
      const uploadResponse = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      return { publicUrl, path, provider };
    }

    // If presign fails (e.g., not authenticated), fall through to direct upload
  } catch (error) {
    console.warn("Presigned upload failed, falling back to direct:", error);
  }

  // Fallback: Direct Supabase upload
  const supabase = createClient();

  const { error: uploadError, data: uploadData } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  if (!uploadData?.path) {
    throw new Error("Upload succeeded but no path returned");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(uploadData.path);

  return { publicUrl, path: uploadData.path, provider: "supabase" };
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
