import { Play } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { rentalListingMedia } from "@/components/rentals/listing-media";
import { RentalLocaleLink } from "@/components/rentals/locale-link";
import { RentalOwnerStatCounts } from "@/components/rentals/owner-stat-counts";
import type { Locale } from "@/lib/i18n/routing";
import { buildAlternates } from "@/lib/metadata";
import { rentalColumns, rentalId, type RentalListing } from "@/lib/rentals/data";
import { rentalListingPath } from "@/lib/rentals/urls";
import { readRentalOwnerStats } from "@/lib/rentals/stats-server";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ locale: Locale; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, locale } = await params;
  const t = await getTranslations({ locale, namespace: "rentalsPilot" });
  return {
    title: t("stats"),
    alternates: buildAlternates(locale, `/rentals/listing/${id}/stats`),
    robots: { index: false, follow: false },
    openGraph: null,
    twitter: null,
  };
}

export default async function RentalListingStats({ params }: Props) {
  const { id, locale } = await params;
  setRequestLocale(locale);
  if (!rentalId.safeParse(id).success) notFound();

  const [t, format, db] = await Promise.all([
    getTranslations({ locale, namespace: "rentalsPilot" }),
    getFormatter({ locale }),
    createClient(),
  ]);
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();

  const [{ data: listing }, ownerStats] = await Promise.all([
    db.from("rental_listings").select(rentalColumns).eq("id", id).eq("host_id", user.id).maybeSingle(),
    readRentalOwnerStats(db, id),
  ]);
  if (!listing || ownerStats?.length === 0) notFound();

  const { items } = await rentalListingMedia(listing as RentalListing, locale);
  const stats = ownerStats?.[0];
  const countsByMedia = new Map(stats?.media.map(asset => [asset.src, asset.clicks]));
  const ranked = items.flatMap(item => {
    const clicks = countsByMedia.get(item.src);
    return clicks ? [{ ...item, clicks }] : [];
  }).sort((a, b) => b.clicks - a.clicks);

  return <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
    <nav aria-label={t("stats")} className="flex flex-wrap gap-4">
      <RentalLocaleLink locale={locale} href="/rentals/stats" className="inline-flex min-h-11 items-center text-sm underline">{t("stats")}</RentalLocaleLink>
      <RentalLocaleLink locale={locale} href={rentalListingPath(listing as RentalListing)} className="inline-flex min-h-11 items-center text-sm underline">{t("viewListing")}</RentalLocaleLink>
    </nav>
    <h1 data-rentals-title className="break-words text-4xl">{listing.title}</h1>
    {stats ? <>
      <div className="rounded-xl border bg-card p-4"><RentalOwnerStatCounts counts={stats.counts} locale={locale} /></div>
      <p className="text-sm text-muted-foreground">{t("statsCounting")}</p>
      <section aria-labelledby="rental-ranked-media" className="space-y-3">
        <h2 id="rental-ranked-media" className="text-xl font-semibold">{t("statsMostOpened")}</h2>
        {ranked.length === 0 ? <p className="text-sm text-muted-foreground">{t("statsNoMedia")}</p> : <ol className="divide-y rounded-xl border bg-card">
          {ranked.map(item => {
            const preview = item.kind === "photo" ? item.src : item.poster;
            return <li key={item.src} className="flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                  {preview && <img src={preview} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />}
                  {item.kind === "video" && <Play aria-hidden="true" className="relative size-6 rounded-full bg-black/60 p-1 text-white" />}
                </div>
                <span className="break-words text-sm">{item.label}</span>
              </div>
              <span className="shrink-0 font-medium tabular-nums" aria-label={format.number(item.clicks) + " " + t("statsMediaClicks")}>{format.number(item.clicks)}</span>
            </li>;
          })}
        </ol>}
      </section>
    </> : <p role="alert">{t("failed")}</p>}
  </main>;
}
