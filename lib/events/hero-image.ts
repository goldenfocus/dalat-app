import { generateSrcSet, optimizedImageUrl } from "@/lib/image-cdn";

/**
 * Responsive sources for the homepage featured photo.
 *
 * The card and the page-level LCP preload both call this, so the browser
 * preloads exactly the candidate the <img> then requests. Keep it the only
 * place these widths, sizes and quality are written down.
 */
export const HERO_IMAGE_WIDTHS = [480, 640, 828, 1080, 1440, 1920];
// The card fills the 72rem home column minus its 1rem gutters.
export const HERO_IMAGE_SIZES = "(max-width: 1152px) 100vw, 1120px";
const HERO_IMAGE_QUALITY = 70;
const HERO_IMAGE_FALLBACK_WIDTH = 1080;

export interface HeroImageSources {
  src: string;
  /** Absent for URLs the CDN cannot resize (one candidate only). */
  srcSet?: string;
  sizes?: string;
}

export function heroImageSources(coverUrl: string): HeroImageSources {
  const src =
    optimizedImageUrl(coverUrl, {
      width: HERO_IMAGE_FALLBACK_WIDTH,
      quality: HERO_IMAGE_QUALITY,
    }) || coverUrl;

  if (src === coverUrl) return { src };

  return {
    src,
    srcSet: generateSrcSet(coverUrl, HERO_IMAGE_WIDTHS, {
      quality: HERO_IMAGE_QUALITY,
    }),
    sizes: HERO_IMAGE_SIZES,
  };
}
