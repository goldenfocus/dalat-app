import { getTranslations } from "next-intl/server";
import { HeroQuickActions } from "./hero-quick-actions";

export async function HeroSection() {
  const t = await getTranslations("hero");

  return (
    <section className="relative">
      <div className="container max-w-6xl mx-auto px-4 pt-4 pb-2 lg:pt-8 lg:pb-6">
        {/* Headlines - Server rendered for fast LCP */}
        <div className="max-w-2xl">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            {t("headline")}
          </h1>
          <p className="mt-2 text-base text-muted-foreground lg:text-lg hidden sm:block">
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
