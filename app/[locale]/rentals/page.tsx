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
import { addViewingSlot, changeViewing } from "./actions";

type Props = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ viewing?: string; error?: string }> };
const facts = [["amenities", ["wifi", "water", "cleaningExtra", "electricityExtra", "yogaMat", "sandals", "waterFilter"]],
  ["area", ["quiet", "trails", "cafeNearby"]], ["rules", ["noDogs", "noParties", "childrenAge", "noDrugs"]]] as const;

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
    getTranslations("rentalsPilot"), getTranslations("common"), createClient(), searchParams,
  ]);
  const { data: { user } } = await db.auth.getUser();
  const [listingResult, visitsResult] = await Promise.all([
    db.from("rental_listings").select(rentalColumns).order("created_at").limit(100),
    user ? db.from("rental_visits").select("id,listing_id,renter_id,slot_id,starts_at,status").order("created_at", { ascending: false }).limit(60) : null,
  ]);
  const listings = listingResult.data as RentalListing[] | null;
  const visits = (visitsResult?.data || []) as RentalVisit[];
  const ownsListing = listings?.some(l => l.host_id === user?.id);
  const currency = new Intl.NumberFormat(locale, { style: "currency", currency: "VND" });
  const time = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium", timeStyle: "short" });
  const button = "inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground";
  const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2";
  const formControl = "min-h-11 rounded-lg border bg-background px-3 py-2";
  const labels = {
    close: common("close"), previous: common("previousPhoto"), next: common("nextPhoto"),
    reset: t("resetZoom"), play: t("play"), pause: t("pause"), mute: t("mute"), unmute: t("unmute"),
    unavailable: t("videoUnavailable"),
  };
  const loginPath = "/auth/login?next=" + encodeURIComponent((locale === "en" ? "" : "/" + locale) + "/rentals");
  const publishedListings = (listings || []).filter(l => l.status === "published");
  const translated = await translatedRecords("rental", publishedListings.map(l => l.id), locale).catch(() => new Map());
  return (
    <div className="mx-auto max-w-5xl space-y-7 px-4 py-8 sm:px-8">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">{t("title")}</h1>
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
        const description = strings?.get("description") || listing.description;
        const active = visits.some(v => v.listing_id === listing.id && v.renter_id === user?.id &&
          ["pending", "proposed", "confirmed"].includes(v.status) && (!v.starts_at || Date.parse(v.starts_at) > Date.now()));
        const slots = isOwner || active || listing.status !== "published" ? [] :
          (await db.rpc("rental_open_times", { listing: listing.id })).data as { id: string; starts_at: string }[] | null;
        const photos: RentalGalleryItem[] = listing.photos.filter(safeRentalPhoto).map((src, index) => ({
          kind: "photo", src, label: t("viewPhoto", { number: index + 1 }),
        }));
        if (pilot) photos.push({ kind: "video", src: pilotMedia + "/reel.mp4", poster: pilotMedia + "/photo-5.webp",
          label: t("reel", { name: listing.title }), captions: { src: "/api/rentals/reel-captions/" + locale, locale, label: t("captions") } });
        const prices = [["monthly", listing.monthly_rent], ["sixMonths", listing.six_month_rent], ["yearly", listing.yearly_rent]] as const;
        return (
          <article id={"listing-" + listing.id} key={listing.id} className="min-w-0 space-y-5 rounded-3xl border bg-card p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4" aria-hidden="true" /> Đà Lạt</p>
                <h2 className="break-words text-3xl font-semibold">{title}</h2>
              </div>
              {isOwner && <Link href={`/rentals/new?id=${listing.id}`} className={secondary}>{common("edit")}</Link>}
            </div>
            {listing.status === "draft" && <p className="text-sm text-muted-foreground">{t("draft")}</p>}
            <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <RentalGallery items={photos} labels={labels} title={t("photos")} />
              <div className="min-w-0 space-y-5">
                <section className="rounded-xl bg-muted p-4">
                  <h3 className="font-semibold">{t("rent")}</h3>
                  <dl className="divide-y">
                    {prices.map(([term, amount]) => amount && <div key={term} className="flex flex-wrap justify-between gap-x-3 py-2">
                      <dt>{t(term)}</dt><dd className="font-semibold">{currency.format(amount)}</dd>
                    </div>)}
                  </dl>
                </section>
                <p className="break-words whitespace-pre-wrap">{description}</p>
                {(description !== listing.description || title !== listing.title) &&
                  <OriginalText text={[listing.title, listing.description].join("\n")} sourceLocale={listing.source_locale} />}
                {pilot && facts.map(([heading, items]) => <section key={heading} className="space-y-1"><h3 className="font-semibold">{t(heading)}</h3>
                  <ul className="list-disc space-y-1 ps-5">{items.map(item => <li key={item}>{t(item)}</li>)}</ul></section>)}
                {!isOwner && listing.status === "published" && (
                  active ? <a className={secondary} href="#viewings">{t("viewings")}</a> :
                  user ? (
                    <ViewingPicker listing={listing.id} slots={slots || []} locale={locale}
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
        {ownsListing && <form action={addViewingSlot} className="flex flex-wrap items-end gap-2 rounded-xl border p-4">
          <label className="grid gap-1">{t("viewingTime")}<input className={formControl} required type="datetime-local" name="starts_at" /></label>
          <button className={button}>{t("addTime")}</button>
        </form>}
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
