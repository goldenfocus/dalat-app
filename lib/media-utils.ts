// Media type detection and validation utilities

// Default image paths
const DEFAULT_IMAGE_PATHS = [
  "/images/defaults/event-default-mobile.png",
  "/images/defaults/event-default-desktop.png",
];

export function isDefaultImageUrl(url: string | null): boolean {
  if (!url) return false;
  return DEFAULT_IMAGE_PATHS.some((path) => url.includes(path));
}

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
  // Formats that require conversion before upload
  convertible: {
    image: ["image/heic", "image/heif"],
    video: ["video/quicktime"], // MOV
  },
} as const;

// All allowed types as a flat array (for file input accept)
export const ALL_ALLOWED_TYPES = [
  ...ALLOWED_MEDIA_TYPES.image,
  ...ALLOWED_MEDIA_TYPES.gif,
  ...ALLOWED_MEDIA_TYPES.video,
  ...ALLOWED_MEDIA_TYPES.convertible.image,
  ...ALLOWED_MEDIA_TYPES.convertible.video,
];

// Check if file needs conversion before upload
export function needsConversion(file: File): "heic" | "mov" | null {
  if (ALLOWED_MEDIA_TYPES.convertible.image.includes(file.type as never)) {
    return "heic";
  }
  if (ALLOWED_MEDIA_TYPES.convertible.video.includes(file.type as never)) {
    return "mov";
  }
  // Also check file extension as fallback (some browsers report wrong MIME)
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "heic" || ext === "heif") return "heic";
  if (ext === "mov") return "mov";
  return null;
}

// Validate file and return error message if invalid
export function validateMediaFile(file: File): string | null {
  const isImage = ALLOWED_MEDIA_TYPES.image.includes(
    file.type as (typeof ALLOWED_MEDIA_TYPES.image)[number]
  );
  const isGif = file.type === "image/gif";
  const isVideo = ALLOWED_MEDIA_TYPES.video.includes(
    file.type as (typeof ALLOWED_MEDIA_TYPES.video)[number]
  );
  const isConvertibleImage = ALLOWED_MEDIA_TYPES.convertible.image.includes(
    file.type as (typeof ALLOWED_MEDIA_TYPES.convertible.image)[number]
  );
  const isConvertibleVideo = ALLOWED_MEDIA_TYPES.convertible.video.includes(
    file.type as (typeof ALLOWED_MEDIA_TYPES.convertible.video)[number]
  );

  // Also check extension as fallback
  const ext = file.name.split(".").pop()?.toLowerCase();
  const isHeicByExt = ext === "heic" || ext === "heif";
  const isMovByExt = ext === "mov";

  const isValidImage = isImage || isConvertibleImage || isHeicByExt;
  const isValidVideo = isVideo || isConvertibleVideo || isMovByExt;

  if (!isValidImage && !isGif && !isValidVideo) {
    return "Unsupported format. Use JPEG, PNG, WebP, HEIC, GIF, MP4, WebM, or MOV";
  }

  if ((isValidImage || isHeicByExt) && file.size > MEDIA_SIZE_LIMITS.image) {
    return "Images must be less than 10MB";
  }

  if (isGif && file.size > MEDIA_SIZE_LIMITS.gif) {
    return "GIFs must be less than 15MB";
  }

  if ((isValidVideo || isMovByExt) && file.size > MEDIA_SIZE_LIMITS.video) {
    return "Videos must be less than 50MB";
  }

  return null;
}
