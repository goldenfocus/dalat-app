import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { Link, locales } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { TribeCard } from "@/components/tribes/tribe-card";
import { getDiscoverTribes } from "@/lib/tribes";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import type { Locale } from "@/lib/types";

export const revalidate = 300;

type PageProps = { params: Promise<{ locale: Locale }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tribes" });
  return generateLocalizedMetadata({
    locale,
    path: "/tribes",
    title: t("discoverTitle"),
    description: t("discoverSubtitle"),
    keywords: [
      "Da Lat communities",
      "Dalat groups",
      "Da Lat tribes",
      "meet people Da Lat",
      "hội nhóm Đà Lạt",
      "cộng đồng Đà Lạt",
    ],
  });
}

export default async function TribesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tribes");
  const tribes = await getDiscoverTribes();

  return (
    <main className="container max-w-6xl mx-auto px-4 py-8">
      <JsonLd
        data={generateBreadcrumbSchema(
          [
            { name: "Home", url: `https://dalat.app/${locale}` },
            { name: t("discoverTitle"), url: `https://dalat.app/${locale}/tribes` },
          ],
          locale
        )}
      />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">{t("discoverTitle")}</h1>
          <p className="text-muted-foreground max-w-xl">{t("discoverSubtitle")}</p>
        </div>
        <Link href="/tribes/new">
          <Button className="gap-2 active:scale-95 transition-all">
            <Plus className="w-4 h-4" />
            {t("startTribe")}
          </Button>
        </Link>
      </div>

      {tribes.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-muted-foreground">{t("emptyTitle")}</p>
          <Link href="/tribes/new">
            <Button size="lg" className="gap-2 active:scale-95 transition-all">
              <Plus className="w-4 h-4" />
              {t("emptyCta")}
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {tribes.map((tribe) => (
            <TribeCard key={tribe.id} tribe={tribe} />
          ))}
        </div>
      )}
    </main>
  );
}
