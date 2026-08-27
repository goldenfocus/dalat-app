import sharp from "sharp";
import {
  FLYER_MAX_BYTES,
  type FlyerMimeType,
} from "@/lib/events/flyer-suggestion";

const FLYER_MAX_PIXELS = 40_000_000;

/**
 * Decode and re-encode the upload before public storage. This rejects
 * truncated/polyglot files and strips any trailing non-image payload.
 */
export async function sanitizeFlyerImage(
  bytes: Uint8Array,
  mimeType: FlyerMimeType
): Promise<Buffer | null> {
  try {
    const image = sharp(Buffer.from(bytes), {
      failOn: "error",
      limitInputPixels: FLYER_MAX_PIXELS,
      sequentialRead: true,
    }).rotate();

    const sanitized = mimeType === "image/png"
      ? await image.png({ compressionLevel: 9 }).toBuffer()
      : mimeType === "image/webp"
        ? await image.webp({ quality: 90 }).toBuffer()
        : await image.jpeg({ quality: 90, mozjpeg: true }).toBuffer();

    return sanitized.length > 0 && sanitized.length <= FLYER_MAX_BYTES
      ? sanitized
      : null;
  } catch {
    return null;
  }
}
