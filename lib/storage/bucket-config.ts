/**
 * Shared bucket configuration for storage validation.
 * Used by presign and multipart upload API routes.
 */
export const BUCKET_CONFIG: Record<string, string[]> = {
  avatars: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  "event-media": [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/ogg",
    "audio/x-m4a",
  ],
  "event-materials": [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/ogg",
    "audio/x-m4a",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  "sponsor-logos": [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/svg+xml",
  ],
  moments: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ],
  "venue-media": ["image/jpeg", "image/png", "image/webp", "image/gif"],
  "organizer-logos": ["image/jpeg", "image/png", "image/webp"],
  "persona-references": ["image/jpeg", "image/png", "image/webp"],
  "moment-materials": [
    "application/pdf",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/mp4",
    "audio/x-m4a",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ],
  "promo-media": [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "application/pdf",
  ],
};

export function validateBucketAndContentType(
  bucket: string,
  contentType: string
): string | null {
  const allowedTypes = BUCKET_CONFIG[bucket];
  if (!allowedTypes) {
    return `Invalid bucket: ${bucket}`;
  }
  if (!allowedTypes.includes(contentType)) {
    return `Content type ${contentType} not allowed for bucket ${bucket}`;
  }
  return null;
}
