// Media type detection and validation utilities

export function isVideoUrl(url: string | null): boolean {
  if (!url) return false;
  return /\.(mp4|webm)$/i.test(url);
}

export function isGifUrl(url: string | null): boolean {
  if (!url) return false;
  return /\.gif$/i.test(url);
}

export type MediaType = "video" | "gif" | "image";

export function getMediaType(url: string | null): MediaType | null {
  if (!url) return null;
  if (isVideoUrl(url)) return "video";
  if (isGifUrl(url)) return "gif";
  return "image";
}

// File size limits in bytes
export const MEDIA_SIZE_LIMITS = {
  image: 10 * 1024 * 1024, // 10MB
  gif: 15 * 1024 * 1024, // 15MB
  video: 50 * 1024 * 1024, // 50MB
} as const;

// Allowed MIME types
export const ALLOWED_MEDIA_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp"],
  gif: ["image/gif"],
  video: ["video/mp4", "video/webm"],
} as const;

// All allowed types as a flat array (for file input accept)
export const ALL_ALLOWED_TYPES = [
  ...ALLOWED_MEDIA_TYPES.image,
  ...ALLOWED_MEDIA_TYPES.gif,
  ...ALLOWED_MEDIA_TYPES.video,
];

// Validate file and return error message if invalid
export function validateMediaFile(file: File): string | null {
  const isImage = ALLOWED_MEDIA_TYPES.image.includes(
    file.type as (typeof ALLOWED_MEDIA_TYPES.image)[number]
  );
  const isGif = file.type === "image/gif";
  const isVideo = ALLOWED_MEDIA_TYPES.video.includes(
    file.type as (typeof ALLOWED_MEDIA_TYPES.video)[number]
  );

  if (!isImage && !isGif && !isVideo) {
    return "Unsupported format. Use JPEG, PNG, WebP, GIF, MP4, or WebM";
  }

  if (isImage && file.size > MEDIA_SIZE_LIMITS.image) {
    return "Images must be less than 10MB";
  }

  if (isGif && file.size > MEDIA_SIZE_LIMITS.gif) {
    return "GIFs must be less than 15MB";
  }

  if (isVideo && file.size > MEDIA_SIZE_LIMITS.video) {
    return "Videos must be less than 50MB";
  }

  return null;
}
