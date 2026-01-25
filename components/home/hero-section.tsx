import { getTranslations } from "next-intl/server";

export async function HeroSection() {
  const t = await getTranslations("hero");

  return (
    <section className="relative">
      <div className="container max-w-6xl mx-auto px-4 pt-3 pb-1 lg:pt-6 lg:pb-4">
        {/* Headlines - Server rendered for fast LCP */}
        <div className="max-w-2xl">
          <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
            {t("headline")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground lg:text-base hidden sm:block">
            {t("subtitle")}
          </p>
        </div>
      </div>
    </section>
  );
}
