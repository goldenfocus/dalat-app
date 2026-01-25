import { ArrowLeft, Search } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { type Locale, locales } from "@/lib/i18n/routing";
import { EventSearchBar } from "@/components/events/event-search-bar";
import { generateLocalizedMetadata } from "@/lib/metadata";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });

  return generateLocalizedMetadata({
    locale,
    path: "/search",
    title: t("search.placeholder"),
    description: t("title"),
    type: "website",
  });
}

export default async function SearchLandingPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const navT = await getTranslations("search");

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-4xl items-center justify-between mx-auto px-4">
          <Link
            href="/"
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{navT("back")}</span>
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 container max-w-4xl mx-auto px-4 py-8">
        {/* Page title */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
            <Search className="w-6 h-6 text-muted-foreground" />
            {t("search.placeholder")}
          </h1>
          <p className="text-muted-foreground">
            {t("title")}
          </p>
        </div>

        {/* Search bar - auto-focused for immediate typing */}
        <div className="max-w-md mx-auto">
          <EventSearchBar className="w-full" />
        </div>
      </div>
    </main>
  );
}
