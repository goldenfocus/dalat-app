import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link, type Locale } from "@/lib/i18n/routing";
import { generateLocalizedMetadata } from "@/lib/metadata";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "eventSuggestion" });
  return generateLocalizedMetadata({
    locale,
    path: "/events/suggest",
    title: t("title"),
    description: t("subtitle"),
  });
}

export default async function SuggestEventPage() {
  const t = await getTranslations("eventSuggestion");
  const nav = await getTranslations("nav.footer");

  return (
    <main className="min-h-[70vh] bg-background">
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:py-28">
        <div className="mb-6 rounded-full bg-emerald-500/10 p-4 text-emerald-600">
          <Sparkles className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
          {t("subtitle")}
        </p>
        <Link
          href="/discover"
          className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {nav("discover")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}
