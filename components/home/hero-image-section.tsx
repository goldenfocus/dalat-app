import { getTranslations } from "next-intl/server";
import { optimizedImageUrl } from "@/lib/image-cdn";

interface HeroImageSectionProps {
  imageUrl: string;
  focalPoint?: string | null;
}

/**
 * Hero section with full-bleed background image.
 * Compact version optimized for showing more events on mobile.
 */
export async function HeroImageSection({ imageUrl, focalPoint }: HeroImageSectionProps) {
  const t = await getTranslations("hero");

  // Optimize image for Cloudflare CDN
  const optimizedUrl = optimizedImageUrl(imageUrl, {
    width: 1920,
    quality: 80,
    format: "auto",
  });

  return (
    <section className="relative">
      {/* Full-bleed image container - ultra-flat on mobile for max event visibility */}
      <div className="aspect-[3/1] lg:aspect-auto lg:h-[350px] bg-muted overflow-hidden">
        <img
          src={optimizedUrl || imageUrl}
          alt=""
          role="presentation"
          className="w-full h-full object-cover"
          style={focalPoint ? { objectPosition: focalPoint } : undefined}
          fetchPriority="high"
        />
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" aria-hidden="true" />

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0">
        <div className="container max-w-6xl mx-auto px-4 pb-3 sm:pb-6">
          <div className="max-w-2xl">
            <h1 className="text-lg font-bold tracking-tight text-white drop-shadow-lg sm:text-2xl lg:text-4xl">
              {t("headline")}
            </h1>
            <p className="mt-1 text-sm text-white/90 drop-shadow lg:text-base hidden sm:block">
              {t("subtitle")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
