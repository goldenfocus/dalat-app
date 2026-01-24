import { getTranslations } from "next-intl/server";
import { optimizedImageUrl } from "@/lib/image-cdn";
import { HeroImageQuickActions } from "./hero-image-quick-actions";

interface HeroImageSectionProps {
  imageUrl: string;
  focalPoint?: string | null;
}

/**
 * Hero section with full-bleed background image.
 * Matches the venue page hero treatment with gradient overlay.
 * Falls back to HeroSection when no image is configured.
 */
export async function HeroImageSection({ imageUrl, focalPoint }: HeroImageSectionProps) {
  const t = await getTranslations("hero");

  // Optimize image for Cloudflare CDN
  // Using larger size for hero (full-width on desktop)
  const optimizedUrl = optimizedImageUrl(imageUrl, {
    width: 1920,
    quality: 80,
    format: "auto",
  });

  return (
    <section className="relative">
      {/* Full-bleed image container */}
      <div className="aspect-[16/9] sm:aspect-[2.5/1] bg-muted overflow-hidden">
        <img
          src={optimizedUrl || imageUrl}
          alt=""
          className="w-full h-full object-cover"
          style={focalPoint ? { objectPosition: focalPoint } : undefined}
          // High priority for LCP
          fetchPriority="high"
        />
      </div>

      {/* Gradient overlay - matches venue page treatment */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0">
        <div className="container max-w-6xl mx-auto px-4 pb-6 sm:pb-8">
          {/* Headlines - white text on dark gradient */}
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-lg sm:text-3xl lg:text-5xl">
              {t("headline")}
            </h1>
            <p className="mt-2 text-base text-white/80 drop-shadow lg:text-lg">
              {t("subtitle")}
            </p>
          </div>

          {/* Quick access pills - styled for dark background */}
          <HeroImageQuickActions
            labels={{
              map: t("map"),
              calendar: t("calendar"),
              venues: t("venues"),
            }}
          />
        </div>
      </div>
    </section>
  );
}
