import { getTranslations } from "next-intl/server";
import { HeroQuickActions } from "./hero-quick-actions";

export async function HeroSection() {
  const t = await getTranslations("hero");

  return (
    <section className="relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-teal-500/5 via-transparent to-transparent dark:from-teal-400/10" />

      {/* Decorative curved line */}
      <svg
        className="absolute top-8 right-0 w-32 h-32 text-teal-500/10 dark:text-teal-400/20"
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M10 50 Q 50 10, 90 50 Q 50 90, 10 50"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </svg>

      <div className="relative px-4 pt-6 pb-6">
        {/* Headlines - Server rendered for fast LCP */}
        <div className="max-w-md">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("headline")}
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        {/* Quick access pills - Client component for interactivity */}
        <HeroQuickActions
          labels={{
            map: t("map"),
            calendar: t("calendar"),
            venues: t("venues"),
          }}
        />
      </div>
    </section>
  );
}
