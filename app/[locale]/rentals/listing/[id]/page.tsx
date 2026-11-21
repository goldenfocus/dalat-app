import { RentalLocaleLink } from "@/components/rentals/locale-link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cache } from "react";
import { OriginalText } from "@/components/ui/original-text";
import { SharePageButton } from "@/components/shared/share-page-button";
import { type Locale } from "@/lib/i18n/routing";
import { buildAlternates, generateLocalizedMetadata, localeUrl } from "@/lib/metadata";
import { createClient } from "@/lib/supabase/server";
import { translatedRecords } from "@/lib/translations/public-content";
import { pilotListingId, rentalColumns, rentalId, safeRentalPhoto, type RentalListing } from "@/lib/rentals/data";
import { fetchRentalSearchTranslations, rentalSearchLocales } from "@/lib/rentals/search-indexing";
import { isRentalSlug, rentalListingPath } from "@/lib/rentals/urls";
import { JsonLd } from "@/lib/structured-data";
import { rentalLeaseRates } from "@/lib/rentals/lease";
import { readRentalSlots } from "@/lib/rentals/read-slots";
import { RentalPublicStats } from "@/components/rentals/public-stats";
import { RentalGallery } from "@/components/rentals/gallery";
import { RentalListingFacts } from "@/components/rentals/listing-facts";
import { RentalListingPrices } from "@/components/rentals/listing-prices";
import { rentalListingMedia } from "@/components/rentals/listing-media";
import { RentalDirectionsPanel } from "@/components/rentals/directions";
import { rentalDirectionsColumns, type RentalDirections } from "@/lib/rentals/directions";
import { ViewingPicker } from "@/components/rentals/viewing-picker";
import { DeleteRentalListing } from "@/components/rentals/delete-listing";
import { deleteSavedRental, publishSavedRental } from "./actions";

type Props = { params: Promise<{ locale: Locale; id: string }>; searchParams: Promise<{ error?: string }> };
const primary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-medium text-primary-foreground";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border px-3";

const readListing = cache(async (key: string, locale: Locale) => {
  if (!isRentalSlug(key)) notFound();
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const { data } = await db.from("rental_listings").select(rentalColumns)
    .eq(rentalId.safeParse(key).success ? "id" : "slug", key).maybeSingle();
  const listing = data as RentalListing | null;
  const owner = listing?.host_id === user?.id;
  if (!listing || (listing.status !== "published" && !owner)) notFound();
  const [translations, searchTranslations] = listing.status === "published"
    ? await Promise.all([
      translatedRecords("rental", [listing.id], locale).catch(() => new Map()),
      fetchRentalSearchTranslations(db, [listing.id]).catch(() => []),
    ]) : [new Map(), []];
  const strings = locale === listing.source_locale ? undefined : translations.get(listing.id);
  return { db, user, listing, owner, title: strings?.get("title") || listing.title,
    description: strings?.get("description") || listing.description, tags: strings?.get("tags"),
    readyLocales: rentalSearchLocales(listing, searchTranslations) };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, locale } = await params;
  const { listing, title, description, readyLocales } = await readListing(id, locale);
  const path = rentalListingPath(listing);
  if (listing.status !== "published") {
    const t = await getTranslations({ locale, namespace: "rentalsPilot" });
    return { title: t("unlisted"), alternates: buildAlternates(locale, path), robots: { index: false, follow: false },
      openGraph: null, twitter: null };
  }

  const [t, details] = await Promise.all([
    getTranslations({ locale, namespace: "rentalsPilot" }),
    getTranslations({ locale, namespace: "rentalsDetails" }),
  ]);
  const currency = new Intl.NumberFormat(locale, { style: "currency", currency: "VND" });
  const offer = [details(listing.offer_type)];
  const rate = rentalLeaseRates(listing)[0];
  if (rate) {
    const label = rate.label === "leasePackage" ? t(rate.label, { count: rate.months }) : t(rate.label);
    offer.push(`${label} ${t("rentPerMonth", { amount: currency.format(rate.amount) })}`);
  }
  if (listing.offer_type !== "rent") {
    offer.push(listing.sale_price === null ? details("priceOnRequest") : `${details("salePrice")} ${currency.format(listing.sale_price)}`);
  }
  const listingCopy = description.replace(/\s+/g, " ").trim();
  const previewCopy = Array.from([...offer, listingCopy].filter(Boolean).join(" · "));
  const socialImages = [...new Set(listing.photos.filter(safeRentalPhoto))].slice(0, 4).map((photo, index) => ({
    url: new URL(photo, "https://dalat.app").href,
    alt: index === 0 ? title : `${title} · ${t("photos")} ${index + 1}`,
    type: "image/webp",
  }));
  return generateLocalizedMetadata({
    locale, path, title, index: readyLocales.includes(locale), socialImages,
    availableLocales: readyLocales.includes(locale) ? readyLocales : [],
    description: previewCopy.length > 220 ? previewCopy.slice(0, 219).join("").trimEnd() + "…" : previewCopy.join(""),
  });
}

export default async function RentalListingPage({ params, searchParams }: Props) {
  const { id: key, locale } = await params;
  setRequestLocale(locale);
  const [record, feedback, t, common] = await Promise.all([
    readListing(key, locale), searchParams, getTranslations({ locale, namespace: "rentalsPilot" }), getTranslations({ locale, namespace: "common" }),
  ]);
  const { db, user, listing, owner, title, description, tags, readyLocales } = record;
  const { id } = listing;
  const published = listing.status === "published";
  const path = rentalListingPath(listing);
  const managePath = "/rentals/listing/" + id;
  if (published && listing.slug && key !== listing.slug) {
    permanentRedirect(localeUrl(locale, path) + (feedback.error ? "?error=1" : ""));
  }
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
  const canonical = localeUrl(locale, path);
  const photos = [...new Set(listing.photos.filter(safeRentalPhoto))].map(src => new URL(src, canonical).href);
  const offers = rentalLeaseRates(listing).map(rate => ({
    "@type": "Offer",
    businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
    priceSpecification: {
      "@type": "UnitPriceSpecification", price: rate.amount, priceCurrency: "VND", unitCode: "MON",
    },
    ...(rate.months ? { leaseLength: { "@type": "QuantitativeValue", value: rate.months, unitCode: "MON" } } : {}),
  }));
  const sale = listing.offer_type !== "rent" && listing.sale_price !== null
    ? [{ "@type": "Offer", businessFunction: "http://purl.org/goodrelations/v1#Sell",
      price: listing.sale_price, priceCurrency: "VND" }]
    : [];
  return <div data-rental-unlisted={!published ? "" : undefined} className="min-h-[calc(100svh-3.5rem)] bg-background">
    {published && readyLocales.includes(locale) && <JsonLd data={{
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      "@id": canonical + "#listing",
      url: canonical,
      name: title,
      inLanguage: locale,
      ...(description.trim() ? { description } : {}),
      ...(photos.length ? { image: photos } : {}),
      ...(offers.length || sale.length ? { offers: [...offers, ...sale] } : {}),
      ...(listing.updated_at ? { dateModified: listing.updated_at } : {}),
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: t("title"), item: localeUrl(locale, "/rentals") },
          { "@type": "ListItem", position: 2, name: title, item: canonical },
        ],
      },
    }} />}
    <article className="mx-auto w-full min-w-0 max-w-5xl space-y-5 px-3 py-5 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {owner && <RentalLocaleLink locale={locale} href={managePath + "/stats"} className={secondary}>{t("stats")}</RentalLocaleLink>}
        {owner && <RentalLocaleLink locale={locale} href={managePath + "/tour"} className={secondary}>{t("editTour")}</RentalLocaleLink>}
        {owner && <RentalLocaleLink locale={locale} href={managePath + "/directions"} className={secondary}>{t("directions")}</RentalLocaleLink>}
        {owner && <RentalLocaleLink locale={locale} href={`/rentals/new?id=${id}`} className={secondary}>{common("edit")}</RentalLocaleLink>}
        {published && <SharePageButton url={localeUrl(locale, path)} />}
      </div>
      <header>
        {!published && <p className="text-sm text-muted-foreground">{t("unlisted")}</p>}
        <h1 data-rentals-title className="break-words text-4xl sm:text-5xl">{title}</h1>
        {published && <RentalPublicStats listingId={id} track={!owner} />}
      </header>
      {feedback.error && <p role="alert" className="rounded-lg border p-3">{t("failed")}</p>}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <RentalGallery items={media.items} labels={media.labels} title={t("photos")} videoTitle={media.videoTitle}
          statsListingId={published && !owner ? id : undefined} />
        <div className="min-w-0 space-y-5">
          <RentalListingPrices locale={locale} listing={listing} />
          {description && <p className="break-words whitespace-pre-wrap">{description}</p>}
          {(description !== listing.description || title !== listing.title) &&
            <OriginalText text={[listing.title, listing.description].join("\n")} sourceLocale={listing.source_locale} />}
          <RentalListingFacts data={listing.details} translation={tags} locale={locale} sourceLocale={listing.source_locale} pilot={id === pilotListingId} />
          {directions.data && <RentalDirectionsPanel locale={locale} directions={directions.data as RentalDirections} />}
          {owner && <div className="flex flex-wrap gap-2">
            <form action={publishSavedRental}>
              <input type="hidden" name="listing" value={id} />
              <input type="hidden" name="status" value={published ? "draft" : "published"} />
              <button className={published ? secondary : primary}>{t(published ? "unpublish" : "publish")}</button>
            </form>
            {!published && <DeleteRentalListing remove={deleteSavedRental.bind(null, id)} />}
          </div>}
          {!owner && published && (
            !user ? <RentalLocaleLink locale={locale} href={"/auth/login?next=" + encodeURIComponent(next)} className={primary}>{t("request")}</RentalLocaleLink>
            : active?.error || slots === null ? <p role="alert">{t("failed")}</p>
            : active?.data ? <RentalLocaleLink locale={locale} href={"/rentals/viewings/" + active.data.id} className={secondary}>{t("openViewing")}</RentalLocaleLink>
            : <ViewingPicker listing={id} slots={slots} locale={locale} title={t("viewingTime")} action={t("request")} />
          )}
        </div>
      </div>
    </article>
  </div>;
}
