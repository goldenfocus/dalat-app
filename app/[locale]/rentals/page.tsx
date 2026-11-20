import { RentalLocaleLink } from "@/components/rentals/locale-link";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, locales, type Locale } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { translatedRecords } from "@/lib/translations/public-content";
import { pilotListingId, safeRentalPhoto, rentalColumns, type RentalListing, type RentalVisit } from "@/lib/rentals/data";
import { AvailabilityEditor, type SavedViewingTime } from "@/components/rentals/availability-editor";
import { RentalBrowseControls } from "@/components/rentals/browse-controls";
import { RentalBrowseListing } from "@/components/rentals/browse-listing";
import { matchesRental, rentalBrowseHref, rentalDiscovery } from "@/lib/rentals/discovery";
import { readRentalSlots } from "@/lib/rentals/read-slots";

function requestTime() {
  return new Date();
}

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ viewing?: string; error?: string; q?: string | string[]; filter?: string | string[]; browse?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rentalsPilot" });
  const path = (language: string) => `https://dalat.app${language === "en" ? "" : "/" + language}/rentals`;
  return {
    title: t("title"),
    description: t("intro"),
    robots: { index: false, follow: true },
    alternates: { canonical: path(locale), languages: { ...Object.fromEntries(locales.map(l => [l, path(l)])), "x-default": path("en") } },
  };
}

export default async function RentalsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, common, db, feedback] = await Promise.all([
    getTranslations({ locale, namespace: "rentalsPilot" }), getTranslations({ locale, namespace: "common" }), createClient(), searchParams,
  ]);
  const { data: { user } } = await db.auth.getUser();
  const [listingResult, visitsResult] = await Promise.all([
    db.from("rental_listings").select(rentalColumns).order("created_at").limit(100),
    user ? db.from("rental_visits").select("id,listing_id,renter_id,slot_id,starts_at,status").order("created_at", { ascending: false }).limit(60) : null,
  ]);
  const listings = listingResult.data as RentalListing[] | null;
  const visits = (visitsResult?.data || []) as RentalVisit[];
  const ownsListing = listings?.some(l => l.host_id === user?.id);
  const now = requestTime();
  const savedSlots = user && ownsListing
    ? await readRentalSlots<SavedViewingTime>((from, to) => db.rpc("rental_host_slots")
      .order("starts_at").range(from, to))
    : [];
  const time = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium", timeStyle: "short" });
  const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2";
  const publishedListings = (listings || []).filter(l => l.status === "published");
  const [translated, facts] = await Promise.all([
    translatedRecords("rental", publishedListings.map(l => l.id), locale).catch(() => new Map()),
    getTranslations({ locale, namespace: "rentalsDetails" }),
  ]);
  const translateFact = (key: string, values?: { age: number }) =>
    key === "wifi" || key === "quiet" ? t(key) : facts(key, values);
  const catalog = publishedListings.map(listing => ({
    listing, discovery: rentalDiscovery(listing, translated.get(listing.id), translateFact),
  }));
  const filters = [...new Map(catalog.flatMap(({ discovery }) => discovery.filters.map(fact => [fact.key, fact] as const))).values()]
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  const query = typeof feedback.q === "string" ? feedback.q.trim().slice(0, 120) : "";
  const selected = [...new Set([feedback.filter ?? []].flat())].slice(0, 50);
  const tours = feedback.browse === "tours";
  const matching = catalog.filter(({ discovery }) => matchesRental(discovery, query, selected)).map(({ listing }) => listing);
  const visible = tours ? matching.filter(listing => listing.id === pilotListingId || listing.photos.some(safeRentalPhoto) || listing.videos.length > 0)
    : [...matching, ...(listings || []).filter(l => l.status === "draft" && l.host_id === user?.id)];
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6 px-3 py-5 sm:space-y-8 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 data-rentals-title className="text-4xl sm:text-5xl">{t("title")}</h1>
        {user && <RentalLocaleLink locale={locale} href="/rentals/new" className={secondary}>{common("addRental")}</RentalLocaleLink>}
      </header>
      {(listingResult.error || feedback.error) && <p role="alert" className="rounded-lg border p-3">{t("failed")}</p>}
      {feedback.viewing && <p role="status" className="rounded-lg border border-primary p-3">{t("requested")}</p>}
      {publishedListings.length > 0 && <RentalBrowseControls locale={locale} query={query} selected={selected} tours={tours} filters={filters} />}
      {listings && visible.length === 0 && (
        <div className="space-y-2">
          <p>{query || selected.length ? t("noMatches") : t(tours ? "noTours" : "empty")}</p>
          {(query || selected.length > 0) && <a href={getPathname({ locale, href: rentalBrowseHref("", [], tours) })} className={secondary}>{t("clearFilters")}</a>}
        </div>
      )}
      <div className={tours ? "space-y-5" : "grid gap-4 sm:grid-cols-2"}>
        {visible.map(listing => <RentalBrowseListing key={listing.id} listing={listing}
          strings={translated.get(listing.id)} locale={locale} owner={listing.host_id === user?.id} tours={tours} />)}
      </div>
      {user && (ownsListing || visits.length > 0) && <section id="viewings" className="space-y-4 scroll-mt-24">
        <h2 className="text-2xl font-semibold">{t("viewings")}</h2>
        {ownsListing && <AvailabilityEditor now={now.getTime()} locale={locale} savedTimes={savedSlots} />}
        {visits.map(visit => {
          const listing = listings?.find(l => l.id === visit.listing_id);
          return <article key={visit.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4">
            <div>
              {listing && <h3 className="font-semibold">{translated.get(listing.id)?.get("title") || listing.title}</h3>}
              <p>{t(visit.status)}{visit.starts_at && " · " + time.format(new Date(visit.starts_at))}</p>
            </div>
            <RentalLocaleLink locale={locale} href={"/rentals/viewings/" + visit.id} className={secondary}>{t("openViewing")}</RentalLocaleLink>
          </article>;
        })}
      </section>}
    </div>
  );
}
