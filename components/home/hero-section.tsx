import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/lib/i18n/routing";

export async function HeroSection() {
  const t = await getTranslations("hero");

  return (
    <section className="relative">
      <div className="container max-w-6xl mx-auto px-4 pt-4 lg:pt-8">
        {/* Headlines - Server rendered for fast LCP */}
        <div className="max-w-3xl">
          <h1 className="text-[clamp(2.4rem,10.5vw,4.75rem)] font-extrabold leading-[0.98] tracking-[-0.04em] text-foreground [text-wrap:balance]">
            {t("headline")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground lg:text-base">
            {t("subtitle")}
          </p>
          <Link
            href="/things-to-do-in-dalat"
            className="fog-cap inline-flex min-h-11 items-center gap-1.5 text-primary underline-offset-4 hover:underline"
          >
            {t("thingsToDo")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
