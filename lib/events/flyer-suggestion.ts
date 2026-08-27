export const FLYER_MAX_BYTES = 4 * 1024 * 1024;

export const FLYER_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type FlyerMimeType = (typeof FLYER_MIME_TYPES)[number];

export type FlyerValidationCode = "invalid_flyer" | "flyer_too_large";

export function validateFlyerMetadata(file: Pick<File, "size" | "type">): FlyerValidationCode | null {
  if (!FLYER_MIME_TYPES.includes(file.type as FlyerMimeType) || file.size <= 0) {
    return "invalid_flyer";
  }
  if (file.size > FLYER_MAX_BYTES) return "flyer_too_large";
  return null;
}

/** MIME declarations are user-controlled; verify the actual image signature. */
export function hasValidFlyerSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= png.length && png.every((byte, index) => bytes[index] === byte);
  }
  if (mimeType === "image/webp") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

export function flyerExtension(mimeType: FlyerMimeType): "jpg" | "png" | "webp" {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export function safeFlyerLabel(name: string): string {
  const normalized = name
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return normalized || "event-flyer";
}
