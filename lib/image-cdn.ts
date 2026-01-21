/**
 * Cloudflare Image CDN utilities.
 *
 * Routes Supabase Storage images through Cloudflare's Image Resizing
 * for automatic WebP/AVIF conversion and global edge caching.
 *
 * Requirements:
 * - Domain must be proxied through Cloudflare (orange cloud)
 * - Image Resizing must be enabled (Pro+ plan feature)
 */

export interface ImageOptions {
  /** Target width in pixels */
  width?: number;
  /** Target height in pixels */
  height?: number;
  /** Quality 1-100 (default: 80) */
  quality?: number;
  /** Output format: auto (best), webp, avif, or original */
  format?: "auto" | "webp" | "avif" | "original";
  /** Fit mode */
  fit?: "scale-down" | "contain" | "cover" | "crop" | "pad";
  /** Gravity for crop/cover (default: auto) */
  gravity?: "auto" | "center" | "top" | "bottom" | "left" | "right";
  /** DPR for retina displays (1-3) */
  dpr?: number;
}

const SUPABASE_STORAGE_PATTERN = /supabase\.co\/storage/;

/**
 * Creates an optimized image URL through Cloudflare's Image Resizing.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <img src={optimizedImageUrl(imageUrl, { width: 400 })} />
 *
 * // With quality and format
 * <img src={optimizedImageUrl(imageUrl, { width: 800, quality: 85, format: 'webp' })} />
 *
 * // For thumbnails
 * <img src={optimizedImageUrl(imageUrl, { width: 100, height: 100, fit: 'cover' })} />
 * ```
 */
export function optimizedImageUrl(
  src: string | null | undefined,
  options: ImageOptions = {}
): string | null {
  if (!src) return null;

  // Only optimize Supabase storage URLs
  if (!SUPABASE_STORAGE_PATTERN.test(src)) {
    return src;
  }

  const {
    width,
    height,
    quality = 80,
    format = "auto",
    fit = "scale-down",
    gravity = "auto",
    dpr,
  } = options;

  // Build Cloudflare Image Resizing options
  const cfOptions: string[] = [];

  if (width) cfOptions.push(`width=${width}`);
  if (height) cfOptions.push(`height=${height}`);
  if (quality !== 80) cfOptions.push(`quality=${quality}`);
  if (format !== "auto") cfOptions.push(`format=${format}`);
  if (fit !== "scale-down") cfOptions.push(`fit=${fit}`);
  if (gravity !== "auto") cfOptions.push(`gravity=${gravity}`);
  if (dpr && dpr > 1) cfOptions.push(`dpr=${dpr}`);

  // Always strip metadata for smaller files
  cfOptions.push("metadata=none");

  // If no options specified, return original URL
  if (cfOptions.length === 1) {
    return src;
  }

  // Cloudflare Image Resizing URL format:
  // https://dalat.app/cdn-cgi/image/OPTIONS/ORIGINAL_URL
  return `/cdn-cgi/image/${cfOptions.join(",")}/${src}`;
}

/**
 * Preset configurations for common use cases.
 */
export const imagePresets = {
  /** Thumbnail for cards and lists */
  thumbnail: { width: 200, height: 200, fit: "cover" as const, quality: 75 },

  /** Event card image */
  eventCard: { width: 400, fit: "cover" as const },

  /** Event detail hero image */
  eventHero: { width: 1200, quality: 85 },

  /** Avatar/profile picture */
  avatar: { width: 96, height: 96, fit: "cover" as const },

  /** Large avatar for profile page */
  avatarLarge: { width: 256, height: 256, fit: "cover" as const },

  /** Moment in feed */
  momentFeed: { width: 600, quality: 85 },

  /** Full-screen moment */
  momentFullscreen: { width: 1080, quality: 90 },

  /** Blog cover image */
  blogCover: { width: 1200, height: 630, fit: "cover" as const, quality: 85 },

  /** OG image */
  ogImage: { width: 1200, height: 630, fit: "cover" as const },
} as const;

/**
 * Get optimized URL with a preset configuration.
 *
 * @example
 * ```tsx
 * <img src={getOptimizedUrl(imageUrl, 'eventCard')} />
 * ```
 */
export function getOptimizedUrl(
  src: string | null | undefined,
  preset: keyof typeof imagePresets
): string | null {
  return optimizedImageUrl(src, imagePresets[preset]);
}

/**
 * Generate srcset for responsive images.
 *
 * @example
 * ```tsx
 * <img
 *   src={optimizedImageUrl(src, { width: 400 })}
 *   srcSet={generateSrcSet(src, [200, 400, 800])}
 *   sizes="(max-width: 640px) 100vw, 400px"
 * />
 * ```
 */
export function generateSrcSet(
  src: string | null | undefined,
  widths: number[],
  options: Omit<ImageOptions, "width"> = {}
): string {
  if (!src) return "";

  return widths
    .map((width) => {
      const url = optimizedImageUrl(src, { ...options, width });
      return url ? `${url} ${width}w` : null;
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * Custom Next.js Image loader that uses Cloudflare Image Resizing.
 *
 * Use this with Next.js Image component for Supabase images:
 *
 * @example
 * ```tsx
 * import Image from "next/image";
 * import { cloudflareLoader } from "@/lib/image-cdn";
 *
 * <Image
 *   loader={cloudflareLoader}
 *   src={imageUrl}
 *   alt="Description"
 *   width={400}
 *   height={300}
 * />
 * ```
 */
export function cloudflareLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  // Only apply Cloudflare optimization to Supabase URLs
  if (!SUPABASE_STORAGE_PATTERN.test(src)) {
    return src;
  }

  // Default quality 75 (Next.js default) for optimal LCP on slow networks
  // Balances file size with visual quality for better perceived performance
  const cfOptions = [
    `width=${width}`,
    `quality=${quality || 75}`,
    "format=auto",
    "fit=scale-down",
    "metadata=none",
  ].join(",");

  return `/cdn-cgi/image/${cfOptions}/${src}`;
}
