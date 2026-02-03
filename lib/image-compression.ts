/**
 * Client-side image compression using Canvas API
 *
 * Compresses large images before upload to:
 * - Reduce upload time (critical on mobile/LTE)
 * - Prevent iOS Safari "Load failed" errors on large uploads
 * - Stay under the 10MB limit for images
 *
 * Uses native Canvas API - no additional dependencies needed.
 */

// Images larger than this will be compressed
export const IMAGE_COMPRESSION_THRESHOLD = 3 * 1024 * 1024; // 3MB

// Target size after compression (with some buffer)
export const TARGET_COMPRESSED_SIZE = 2 * 1024 * 1024; // 2MB

// Maximum dimension for any side (preserves aspect ratio)
export const MAX_IMAGE_DIMENSION = 4096; // 4K - good balance of quality and size

export interface CompressionResult {
  file: File;
  wasCompressed: boolean;
  originalSize: number;
  compressedSize: number;
  originalDimensions?: { width: number; height: number };
  compressedDimensions?: { width: number; height: number };
}

/**
 * Check if an image file needs compression
 */
export function needsImageCompression(file: File): boolean {
  const isImage = file.type.startsWith("image/") && file.type !== "image/gif";
  return isImage && file.size > IMAGE_COMPRESSION_THRESHOLD;
}

/**
 * Compress an image file using Canvas API
 *
 * Strategy:
 * 1. Load image into a canvas
 * 2. Resize if larger than MAX_IMAGE_DIMENSION
 * 3. Export as JPEG with quality reduction until under target size
 *
 * @param file - The image file to compress
 * @param options - Optional compression settings
 * @returns Compressed image file (or original if compression not needed/failed)
 */
export async function compressImage(
  file: File,
  options: {
    maxDimension?: number;
    targetSize?: number;
    quality?: number;
    preserveExif?: boolean;
  } = {}
): Promise<CompressionResult> {
  const originalSize = file.size;

  // Skip if doesn't need compression or is a GIF (can't compress animated GIFs)
  if (!needsImageCompression(file)) {
    return {
      file,
      wasCompressed: false,
      originalSize,
      compressedSize: originalSize,
    };
  }

  const maxDimension = options.maxDimension ?? MAX_IMAGE_DIMENSION;
  const targetSize = options.targetSize ?? TARGET_COMPRESSED_SIZE;
  let quality = options.quality ?? 0.85;

  try {
    // Load image into an HTMLImageElement
    const img = await loadImage(file);
    const originalDimensions = { width: img.width, height: img.height };

    // Calculate new dimensions (scale down if needed, maintain aspect ratio)
    let { width, height } = img;
    if (width > maxDimension || height > maxDimension) {
      const scale = Math.min(maxDimension / width, maxDimension / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const compressedDimensions = { width, height };

    // Create canvas and draw image
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get canvas context");
    }

    // Use high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);

    // Try progressively lower quality until we hit target size
    let blob: Blob | null = null;
    const minQuality = 0.5; // Don't go below 50% quality

    while (quality >= minQuality) {
      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality);
      });

      if (!blob) {
        throw new Error("Failed to create image blob");
      }

      // If we're under target size, we're done
      if (blob.size <= targetSize || quality <= minQuality) {
        break;
      }

      // Reduce quality for next iteration
      quality -= 0.1;
    }

    if (!blob) {
      throw new Error("Failed to compress image");
    }

    // If compression made it larger (rare), return original
    if (blob.size >= originalSize) {
      console.log("[ImageCompression] Output larger than input, using original");
      return {
        file,
        wasCompressed: false,
        originalSize,
        compressedSize: originalSize,
        originalDimensions,
      };
    }

    // Create new file with .jpg extension
    const newName = file.name.replace(/\.[^.]+$/, ".jpg");
    const compressedFile = new File([blob], newName, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    console.log(
      `[ImageCompression] Compressed ${formatSize(originalSize)} → ${formatSize(blob.size)} ` +
      `(${originalDimensions.width}x${originalDimensions.height} → ${width}x${height}, q=${Math.round(quality * 100)}%)`
    );

    return {
      file: compressedFile,
      wasCompressed: true,
      originalSize,
      compressedSize: blob.size,
      originalDimensions,
      compressedDimensions,
    };
  } catch (error) {
    console.error("[ImageCompression] Failed:", error);
    // Return original file on error
    return {
      file,
      wasCompressed: false,
      originalSize,
      compressedSize: originalSize,
    };
  }
}

/**
 * Load an image file into an HTMLImageElement
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Format bytes to human-readable size
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get estimated compression ratio for a file
 * Useful for showing estimated compressed size in UI
 */
export function estimateCompressedSize(file: File): number {
  if (!needsImageCompression(file)) {
    return file.size;
  }

  // Rough estimate: JPEG compression typically achieves 3-5x reduction
  // from raw/HEIC-converted images. Be conservative with estimate.
  const estimatedRatio = 0.4; // Assume 60% reduction
  return Math.round(file.size * estimatedRatio);
}
