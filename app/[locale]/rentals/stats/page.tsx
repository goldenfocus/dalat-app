import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RentalLocaleLink } from "@/components/rentals/locale-link";
import { RentalOwnerStatCounts } from "@/components/rentals/owner-stat-counts";
import type { Locale } from "@/lib/i18n/routing";
import { buildAlternates } from "@/lib/metadata";
import { readRentalOwnerStats } from "@/lib/rentals/stats-server";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rentalsPilot" });
  return {
    title: t("stats"),
    alternates: buildAlternates(locale, "/rentals/stats"),
    robots: { index: false, follow: false },
    openGraph: null,
    twitter: null,
  };
}

export default async function RentalStatsDashboard({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, db] = await Promise.all([
    getTranslations({ locale, namespace: "rentalsPilot" }),
    createClient(),
  ]);
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();

  const listings = await readRentalOwnerStats(db);
  return <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
    <h1 data-rentals-title className="text-4xl">{t("stats")}</h1>
    {listings === null && <p role="alert">{t("failed")}</p>}
    {listings?.length === 0 && <p>{t("statsNoListings")}</p>}
    <ul className="space-y-3">
      {listings?.map(listing => <li key={listing.id} className="rounded-xl border bg-card p-4">
        <RentalLocaleLink locale={locale} href={`/rentals/listing/${listing.id}/stats`}
          className="mb-3 flex min-h-11 items-center justify-between gap-3">
          <h2 className="min-w-0 break-words text-lg font-semibold">{listing.title}</h2>
          <span className="flex shrink-0 items-center gap-1">
            {listing.status === "draft" && <span className="text-xs text-muted-foreground">{t("unlisted")}</span>}
            <ChevronRight aria-hidden="true" className="size-5 rtl:rotate-180" />
          </span>
        </RentalLocaleLink>
        <RentalOwnerStatCounts counts={listing.counts} locale={locale} />
      </li>)}
    </ul>
    {!!listings?.length && <p className="text-sm text-muted-foreground">{t("statsCounting")}</p>}
  </main>;
}
