import { generateSrcSet, optimizedImageUrl } from "@/lib/image-cdn";

/**
 * Responsive sources for moment images (feed cards and grid thumbnails).
 *
 * One place for widths, sizes and quality so a card never requests more
 * pixels than it can show. 1920 is reserved for the lightbox / cinema, which
 * build their own URLs. Mirrors `heroImageSources` in lib/events/hero-image.ts.
 */
export interface ResponsiveImageProfile {
  widths: number[];
  sizes: string;
  quality: number;
  /** Width of the plain `src` used by crawlers and browsers without srcset. */
  fallbackWidth: number;
}

/** Full-bleed reel card: the column is capped at max-w-xl (576px). */
export const MOMENT_FEED_IMAGE: ResponsiveImageProfile = {
  widths: [480, 768, 1080, 1440],
  sizes: "(max-width: 576px) 100vw, 576px",
  quality: 70,
  fallbackWidth: 768,
};

/** Square grid tile: two columns on phones, ~240px on larger screens. */
export const MOMENT_THUMB_IMAGE: ResponsiveImageProfile = {
  widths: [240, 360, 480, 640],
  sizes: "(max-width: 640px) 50vw, 240px",
  quality: 70,
  fallbackWidth: 360,
};

export interface ResponsiveImageSources {
  src: string;
  /** Absent for URLs the CDN cannot resize (one candidate only). */
  srcSet?: string;
  sizes?: string;
}

export function responsiveImageSources(
  url: string,
  profile: ResponsiveImageProfile,
): ResponsiveImageSources {
  const src =
    optimizedImageUrl(url, {
      width: profile.fallbackWidth,
      quality: profile.quality,
    }) || url;

  if (src === url) return { src };

  return {
    src,
    srcSet: generateSrcSet(url, profile.widths, { quality: profile.quality }),
    sizes: profile.sizes,
  };
}
