import { getTranslations } from "next-intl/server";
import { HeroQuickActions } from "./hero-quick-actions";

// Pine forest silhouette - THE iconic symbol of Đà Lạt
function PineForestDecor() {
  return (
    <svg
      viewBox="0 0 120 100"
      className="absolute top-4 right-0 w-40 h-32 text-amber-600/10 dark:text-amber-400/15"
      aria-hidden="true"
    >
      {/* Back tree (smaller, lighter) */}
      <path
        d="M85 95 L85 75 L77 75 L85 60 L80 60 L85 45 L90 60 L85 60 L93 75 L85 75 Z"
        fill="currentColor"
        opacity="0.5"
      />
      {/* Middle tree */}
      <path
        d="M60 95 L60 70 L50 70 L60 50 L54 50 L60 30 L66 50 L60 50 L70 70 L60 70 Z"
        fill="currentColor"
        opacity="0.7"
      />
      {/* Front tree (largest, most visible) */}
      <path
        d="M100 95 L100 65 L88 65 L100 40 L92 40 L100 15 L108 40 L100 40 L112 65 L100 65 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export async function HeroSection() {
  const t = await getTranslations("hero");

  return (
    <section className="relative overflow-hidden">
      {/* Warm amber gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent dark:from-amber-400/8" />

      {/* Pine forest decoration - Đà Lạt identity */}
      <PineForestDecor />

      <div className="relative container max-w-6xl mx-auto px-4 pt-8 pb-8 lg:pt-10">
        {/* Headlines - Server rendered for fast LCP */}
        <div className="max-w-xl">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            {t("headline")}
          </h1>
          <p className="mt-2 text-base text-muted-foreground lg:text-lg">
            {t("subtitle")}
          </p>
        </div>

        {/* Quick access pills - Client component for interactivity */}
        <HeroQuickActions
          labels={{
            search: t("search"),
            map: t("map"),
            calendar: t("calendar"),
            venues: t("venues"),
          }}
        />
      </div>
    </section>
  );
}
