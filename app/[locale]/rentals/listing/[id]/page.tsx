import { RentalLocaleLink } from "@/components/rentals/locale-link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cache } from "react";
import { ArrowLeft } from "lucide-react";
import { OriginalText } from "@/components/ui/original-text";
import { SharePageButton } from "@/components/shared/share-page-button";
import { type Locale } from "@/lib/i18n/routing";
import { buildAlternates, generateLocalizedMetadata, localeUrl } from "@/lib/metadata";
import { createClient } from "@/lib/supabase/server";
import { translatedRecords } from "@/lib/translations/public-content";
import { pilotListingId, rentalColumns, rentalId, safeRentalPhoto, type RentalListing } from "@/lib/rentals/data";
import { readRentalSlots } from "@/lib/rentals/read-slots";
import { RentalGallery } from "@/components/rentals/gallery";
import { RentalListingFacts } from "@/components/rentals/listing-facts";
import { RentalListingPrices } from "@/components/rentals/listing-prices";
import { rentalListingMedia } from "@/components/rentals/listing-media";
import { RentalDirectionsPanel } from "@/components/rentals/directions";
import { rentalDirectionsColumns, type RentalDirections } from "@/lib/rentals/directions";
import { ViewingPicker } from "@/components/rentals/viewing-picker";
import { publishSavedRental } from "./actions";

type Props = { params: Promise<{ locale: Locale; id: string }>; searchParams: Promise<{ error?: string }> };
const primary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-medium text-primary-foreground";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border px-3";

const readListing = cache(async (id: string, locale: Locale) => {
  if (!rentalId.safeParse(id).success) notFound();
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const { data } = await db.from("rental_listings").select(rentalColumns).eq("id", id).maybeSingle();
  const listing = data as RentalListing | null;
  const owner = listing?.host_id === user?.id;
  if (!listing || (listing.status !== "published" && !owner)) notFound();
  const strings = listing.status === "published"
    ? (await translatedRecords("rental", [id], locale).catch(() => new Map())).get(id)
    : undefined;
  return { db, user, listing, owner, title: strings?.get("title") || listing.title,
    description: strings?.get("description") || listing.description, tags: strings?.get("tags") };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, locale } = await params;
  const { listing, title, description } = await readListing(id, locale);
  const path = "/rentals/listing/" + id;
  const t = await getTranslations({ locale, namespace: "rentalsPilot" });
  if (listing.status !== "published") {
    return { title: t("preview"), alternates: buildAlternates(locale, path), robots: { index: false, follow: false },
      openGraph: null, twitter: null };
  }
  const cover = listing.photos.find(safeRentalPhoto);
  return generateLocalizedMetadata({
    locale, path, title, description: description || t("intro"), index: false,
    image: cover ? new URL(cover, "https://dalat.app").href : undefined,
  });
}

export default async function RentalListingPage({ params, searchParams }: Props) {
  const { id, locale } = await params;
  setRequestLocale(locale);
  const [record, feedback, t, common] = await Promise.all([
    readListing(id, locale), searchParams, getTranslations({ locale, namespace: "rentalsPilot" }), getTranslations({ locale, namespace: "common" }),
  ]);
  const { db, user, listing, owner, title, description, tags } = record;
  const published = listing.status === "published";
  const path = "/rentals/listing/" + id;
  const next = (locale === "en" ? "" : "/" + locale) + path;
  const active = user && !owner && published ? await db.from("rental_visits").select("id")
    .eq("listing_id", id).eq("renter_id", user.id).in("status", ["pending", "proposed", "confirmed"])
    .or("starts_at.is.null,starts_at.gt." + new Date().toISOString()).limit(1).maybeSingle() : null;
  const [slots, media, directions] = await Promise.all([
    user && !owner && published && !active?.data && !active?.error
      ? readRentalSlots((from, to) => db.rpc("rental_open_times", { listing: id }).order("starts_at").range(from, to))
      : [],
    rentalListingMedia(listing, locale),
    db.from("rental_directions").select(rentalDirectionsColumns).eq("listing_id", id).maybeSingle(),
  ]);
  return <article className="mx-auto w-full min-w-0 max-w-5xl space-y-5 px-3 py-5 sm:px-8 sm:py-8">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <RentalLocaleLink locale={locale} href="/rentals" className={secondary}><ArrowLeft className="me-2 size-4 rtl:rotate-180" aria-hidden="true" />{t("listings")}</RentalLocaleLink>
      <div className="flex flex-wrap items-center gap-2">
        {owner && <RentalLocaleLink locale={locale} href={path + "/directions"} className={secondary}>{t("directions")}</RentalLocaleLink>}
        {owner && <RentalLocaleLink locale={locale} href={`/rentals/new?id=${id}`} className={secondary}>{common("edit")}</RentalLocaleLink>}
        {published && <SharePageButton url={localeUrl(locale, path)} title={title} showLabel className="me-0 min-h-11" />}
      </div>
    </div>
    <header>
      {!published && <p className="text-sm text-muted-foreground">{t("preview")}</p>}
      <h1 data-rentals-title className="break-words text-4xl sm:text-5xl">{title}</h1>
    </header>
    {feedback.error && <p role="alert" className="rounded-lg border p-3">{t("failed")}</p>}
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <RentalGallery items={media.items} labels={media.labels} title={t("photos")} videoTitle={media.videoTitle} />
      <div className="min-w-0 space-y-5">
        <RentalListingPrices locale={locale} listing={listing} />
        {description && <p className="break-words whitespace-pre-wrap">{description}</p>}
        {(description !== listing.description || title !== listing.title) &&
          <OriginalText text={[listing.title, listing.description].join("\n")} sourceLocale={listing.source_locale} />}
        <RentalListingFacts data={listing.details} translation={tags} locale={locale} sourceLocale={listing.source_locale} pilot={id === pilotListingId} />
        {directions.data && <RentalDirectionsPanel locale={locale} directions={directions.data as RentalDirections} />}
        {owner && <form action={publishSavedRental}>
          <input type="hidden" name="listing" value={id} />
          <input type="hidden" name="status" value={published ? "draft" : "published"} />
          <button className={published ? secondary : primary}>{t(published ? "unpublish" : "publish")}</button>
        </form>}
        {!owner && published && (
          !user ? <RentalLocaleLink locale={locale} href={"/auth/login?next=" + encodeURIComponent(next)} className={primary}>{t("request")}</RentalLocaleLink>
          : active?.error || slots === null ? <p role="alert">{t("failed")}</p>
          : active?.data ? <RentalLocaleLink locale={locale} href={"/rentals/viewings/" + active.data.id} className={secondary}>{t("openViewing")}</RentalLocaleLink>
          : <ViewingPicker listing={id} slots={slots} locale={locale} title={t("viewingTime")} action={t("request")} />
        )}
      </div>
    </div>
  </article>;
}
