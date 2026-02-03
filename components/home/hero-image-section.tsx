import { getTranslations } from "next-intl/server";
import { optimizedImageUrl } from "@/lib/image-cdn";

interface HeroImageSectionProps {
  imageUrl: string;
  focalPoint?: string | null;
}

/**
 * Hero section with full-bleed background image.
 * Uses warm "golden hour" overlays inspired by Dalat sunsets.
 * Replaces harsh black gradients with amber/sunset tones for authentic vibes.
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
    <section className="relative overflow-hidden">
      {/* Full-bleed image container - improved aspect ratios for better imagery showcase */}
      {/* Mobile: 16:9 (was 3:1) - shows much more of the beautiful imagery */}
      {/* Desktop: 400px (was 350px) - more visual impact */}
      <div className="aspect-[16/9] sm:aspect-[2/1] lg:aspect-auto lg:h-[400px] bg-muted overflow-hidden">
        <img
          src={optimizedUrl || imageUrl}
          alt=""
          role="presentation"
          className="w-full h-full object-cover animate-hero-breathe"
          style={focalPoint ? { objectPosition: focalPoint } : undefined}
          fetchPriority="high"
          data-no-theme-transition
        />
      </div>

      {/* PRIMARY WARM GRADIENT - replaces harsh black overlay */}
      {/* from-amber-950/70 is deep warm brown (not cold black) */}
      {/* via-orange-900/30 adds sunset warmth in the middle */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-amber-950/70 via-orange-900/30 to-transparent"
        aria-hidden="true"
      />

      {/* SECONDARY WARM TINT - subtle golden glow from corner */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-amber-500/10"
        aria-hidden="true"
      />

      {/* FILM GRAIN TEXTURE - organic, non-digital feel */}
      <div className="absolute inset-0 hero-grain" aria-hidden="true" />

      {/* LIGHT LEAK - dreamy photography effect in top-right */}
      <div className="absolute inset-0 hero-light-leak" aria-hidden="true" />

      {/* Content overlay with WARM TEXT SHADOWS */}
      <div className="absolute bottom-0 left-0 right-0">
        <div className="container max-w-6xl mx-auto px-4 pb-4 sm:pb-8">
          <div className="max-w-2xl animate-hero-fade-up">
            {/* Headline with amber-tinted shadow */}
            <h1
              className="text-xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl"
              style={{
                textShadow: '0 2px 8px rgba(217, 119, 6, 0.4), 0 4px 16px rgba(0, 0, 0, 0.5)'
              }}
            >
              {t("headline")}
            </h1>
            {/* Subtitle with softer warm shadow */}
            <p
              className="mt-2 text-sm text-white/90 lg:text-base hidden sm:block"
              style={{
                textShadow: '0 1px 4px rgba(217, 119, 6, 0.3), 0 2px 8px rgba(0, 0, 0, 0.4)'
              }}
            >
              {t("subtitle")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
