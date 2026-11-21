import { getTranslations, setRequestLocale } from "next-intl/server";
import { type Locale, buildLocales } from "@/lib/i18n/routing";
import { DalatSearch } from "@/components/search/dalat-search";
import { cleanSearchQuery, searchScope } from "@/lib/search/dalat";
import { generateLocalizedMetadata } from "@/lib/metadata";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ q?: string | string[]; type?: string | string[] }>;
};
const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;

export async function generateStaticParams() {
  return buildLocales.map(locale => ({ locale }));
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const t = await getTranslations({ locale, namespace: "home" });
  return generateLocalizedMetadata({
    locale, path: "/search", title: t("search.globalPlaceholder"), description: t("title"),
    type: "website", index: !query.q && !query.type,
  });
}

export default async function SearchPage({ params, searchParams }: PageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const [t, rentals] = await Promise.all([getTranslations("home"), getTranslations("rentalsPilot")]);
  const q = cleanSearchQuery(first(query.q) ?? "");
  const scope = searchScope(first(query.type));
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-3 py-6 sm:px-5">
      <h1 className="text-2xl font-semibold">{t("search.globalPlaceholder")}</h1>
      <DalatSearch key={JSON.stringify([q, scope])} full initialQuery={q} initialScope={scope} rentalsLabel={rentals("title")} />
    </div>
  );
}
