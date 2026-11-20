import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MapPin } from "lucide-react";
import { RentalGallery, type RentalGalleryItem } from "@/components/rentals/gallery";
import { ViewingPicker } from "@/components/rentals/viewing-picker";
import { OriginalText } from "@/components/ui/original-text";
import { Link, locales, type Locale } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { translatedRecords } from "@/lib/translations/public-content";
import { pilotListingId, pilotMedia, rentalColumns, safeRentalPhoto, type RentalListing, type RentalVisit } from "@/lib/rentals/data";
import { AvailabilityEditor, type SavedViewingTime } from "@/components/rentals/availability-editor";
import { RentalListingFacts } from "@/components/rentals/listing-facts";
import { rentalDetails } from "@/lib/rentals/details";
import { changeViewing } from "./actions";

type Props = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ viewing?: string; error?: string }> };


type RentalSlot = { id: string; starts_at: string };

async function readRentalSlots<Slot extends RentalSlot = RentalSlot>(
  query: (from: number, to: number) => PromiseLike<{ data: Slot[] | null; error: unknown }>,
) {
  const pageSize = 500;
  const slots: Slot[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query(offset, offset + pageSize - 1);
    if (error || !data) return null;
    slots.push(...data);
    if (data.length < pageSize) return slots;
  }
}

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
  const [t, details, common, db, feedback] = await Promise.all([
    getTranslations("rentalsPilot"), getTranslations("rentalsDetails"), getTranslations("common"), createClient(), searchParams,
  ]);
  const { data: { user } } = await db.auth.getUser();
  const [listingResult, visitsResult] = await Promise.all([
    db.from("rental_listings").select(rentalColumns).order("created_at").limit(100),
    user ? db.from("rental_visits").select("id,listing_id,renter_id,slot_id,starts_at,status").order("created_at", { ascending: false }).limit(60) : null,
  ]);
  const listings = listingResult.data as RentalListing[] | null;
  const visits = (visitsResult?.data || []) as RentalVisit[];
  const ownsListing = listings?.some(l => l.host_id === user?.id);
  const now = Date.now();
  const savedSlots = user && ownsListing
    ? await readRentalSlots<SavedViewingTime>((from, to) => db.rpc("rental_host_slots")
      .order("starts_at").range(from, to))
    : [];
  const area = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
  const time = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium", timeStyle: "short" });
  const button = "inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground";
  const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2";
  const formControl = "min-h-11 rounded-lg border bg-background px-3 py-2";
  const labels = {
    close: common("close"), previous: common("previousPhoto"), next: common("nextPhoto"),
    reset: t("resetZoom"), play: t("play"), pause: t("pause"), mute: t("mute"), unmute: t("unmute"),
    unavailable: t("videoUnavailable"), processing: details("videoProcessing"),
  };
  const loginPath = "/auth/login?next=" + encodeURIComponent((locale === "en" ? "" : "/" + locale) + "/rentals");
  const publishedListings = (listings || []).filter(l => l.status === "published");
  const translated = await translatedRecords("rental", publishedListings.map(l => l.id), locale).catch(() => new Map());
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6 px-3 py-5 sm:space-y-8 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 data-rentals-title className="text-4xl sm:text-5xl">{t("title")}</h1>
        {user && <Link href="/rentals/new" className={secondary}>{common("addRental")}</Link>}
      </header>
      {(listingResult.error || feedback.error) && <p role="alert" className="rounded-lg border p-3">{t("failed")}</p>}
      {feedback.viewing && <p role="status" className="rounded-lg border border-primary p-3">{t("requested")}</p>}
      {listings?.length === 0 && <p>{t("empty")}</p>}
      {await Promise.all((listings || []).map(async (listing) => {
        const pilot = listing.id === pilotListingId;
        const isOwner = listing.host_id === user?.id;
        const strings = translated.get(listing.id);
        const title = strings?.get("title") || listing.title;
        const { propertySize } = rentalDetails(listing.details);
        const description = strings?.get("description") || listing.description;
        const active = visits.some(v => v.listing_id === listing.id && v.renter_id === user?.id &&
          ["pending", "proposed", "confirmed"].includes(v.status) && (!v.starts_at || Date.parse(v.starts_at) > Date.now()));
        const slots = isOwner || active || listing.status !== "published" ? [] :
          await readRentalSlots((from, to) => db.rpc("rental_open_times", { listing: listing.id })
            .order("starts_at").range(from, to));
        const photos: RentalGalleryItem[] = listing.photos.filter(safeRentalPhoto).map((src, index) => ({
          kind: "photo", src, label: t("viewPhoto", { number: index + 1 }),
        }));
        if (pilot) photos.push({ kind: "video", src: pilotMedia + "/reel.mp4", poster: pilotMedia + "/photo-5.webp",
          label: t("reel", { name: listing.title }), captions: { src: "/api/rentals/reel-captions/" + locale, locale, label: t("captions") } });
        for (const [index, uid] of listing.videos.entries()) {
          const src = "/api/rentals/videos/" + uid;
          photos.push({ kind: "video", src, poster: src + "?poster", stream: true,
            label: details("viewVideo", { number: index + 1 }) });
        }
        const prices = [["monthly", listing.monthly_rent], ["sixMonths", listing.six_month_rent], ["yearly", listing.yearly_rent]] as const;
        return (
          <article id={"listing-" + listing.id} key={listing.id} className="min-w-0 space-y-4 rounded-[18px] border bg-card p-3 sm:space-y-6 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4" aria-hidden="true" /> Đà Lạt</p>
                <h2 data-rentals-title className="mt-1 text-3xl leading-tight sm:text-4xl">{title}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <p className="font-semibold text-primary">{details(listing.offer_type)}</p>
                  {propertySize !== undefined && <p className="text-muted-foreground">
                    {details("propertySize")} <span className="whitespace-nowrap">{area.format(propertySize)} m²</span>
                  </p>}
                </div>
              </div>
              {isOwner && <Link href={`/rentals/new?id=${listing.id}`} className={secondary}>{common("edit")}</Link>}
            </div>
            {listing.status === "draft" && <p className="text-sm text-muted-foreground">{t("draft")}</p>}
            <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <RentalGallery items={photos} labels={labels} title={t("photos")} videoTitle={details("videos")} />
              <div className="min-w-0 space-y-5">
                {listing.offer_type !== "sale" && <section className="rounded-[14px] bg-muted p-4 sm:p-5">
                  <h3 className="font-semibold">{t("rent")}</h3>
                  <dl className="divide-y">
                    {prices.map(([term, amount]) => amount && <div key={term} className="flex flex-wrap justify-between gap-x-3 py-2">
                      <dt>{t(term)}</dt><dd data-rental-rate className="font-bold text-primary">{currency.format(amount)}</dd>
                    </div>)}
                  </dl>
                </section>}
                {listing.offer_type !== "rent" && <section className="rounded-[14px] bg-muted p-4 sm:p-5">
                  <h3 className="font-semibold">{details("salePrice")}</h3>
                  <p className="mt-1 font-bold text-primary">
                    {listing.sale_price === null ? details("priceOnRequest") : currency.format(listing.sale_price)}
                  </p>
                </section>}
                <p className="break-words whitespace-pre-wrap">{description}</p>
                {(description !== listing.description || title !== listing.title) &&
                  <OriginalText text={[listing.title, listing.description].join("\n")} sourceLocale={listing.source_locale} />}
                <RentalListingFacts data={listing.details} translation={strings?.get("tags")}
                  locale={listing.source_locale} pilot={pilot} />
                {!isOwner && listing.status === "published" && (
                  active ? <a className={secondary} href="#viewings">{t("viewings")}</a> :
                  user ? (
                    slots === null ? <p role="alert">{t("failed")}</p> :
                      <ViewingPicker listing={listing.id} slots={slots} locale={locale}
                        title={t("viewingTime")} action={t("request")} />
                  ) : <Link href={loginPath} className={button}>{t("request")}</Link>
                )}
              </div>
            </div>
          </article>
        );
      }))}
      {user && (ownsListing || visits.length > 0) && <section id="viewings" className="space-y-4 scroll-mt-24">
        <h2 className="text-2xl font-semibold">{t("viewings")}</h2>
        {ownsListing && <AvailabilityEditor now={now} locale={locale} savedTimes={savedSlots} />}
        {visits.map(visit => {
          const listing = listings?.find(l => l.id === visit.listing_id);
          const isHost = listing?.host_id === user.id;
          const expired = visit.starts_at && Date.parse(visit.starts_at) <= Date.now();
          const canConfirm = !expired && ((isHost && visit.status === "pending" && visit.starts_at) || (!isHost && visit.status === "proposed"));
          const canPropose = isHost && ["pending", "proposed"].includes(visit.status);
          const canCancel = ["pending", "proposed", "confirmed"].includes(visit.status);
          return <article key={visit.id} className="space-y-2 rounded-xl border p-4">
            {listing && <h3 className="font-semibold">{listing.title}</h3>}
            <p>{t(visit.status)}{visit.starts_at && " · " + time.format(new Date(visit.starts_at))}</p>
            {(canConfirm || canPropose || canCancel) && <form action={changeViewing} className="flex flex-wrap gap-2">
              <input type="hidden" name="visit" value={visit.id} />
              {canConfirm && <button name="next" value="confirmed" className={button}>{t("confirm")}</button>}
              {canPropose && <button name="next" value="declined" className={secondary}>{common("reject")}</button>}
              {canCancel && <button name="next" value="cancelled" className={secondary}>{common("cancel")}</button>}
              {canPropose && <label className="grid w-full gap-1">{t("viewingTime")}<input className={formControl} type="datetime-local" name="proposed_time" /></label>}
              {canPropose && <button name="next" value="proposed" className={secondary}>{t("propose")}</button>}
            </form>}
          </article>;
        })}
      </section>}
    </div>
  );
}
