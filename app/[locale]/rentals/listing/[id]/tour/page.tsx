import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RentalLocaleLink } from "@/components/rentals/locale-link";
import { rentalListingMedia } from "@/components/rentals/listing-media";
import { RentalTourEditor } from "@/components/rentals/tour-editor";
import type { Locale } from "@/lib/i18n/routing";
import { buildAlternates } from "@/lib/metadata";
import { automaticRentalTour, rentalTourFrames } from "@/lib/rentals/tour";
import { saveRentalTour } from "./actions";
import { readOwnedRentalTour } from "./owner";

type Props = { params: Promise<{ id: string; locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, locale } = await params;
  const t = await getTranslations({ locale, namespace: "rentalsPilot" });
  return {
    title: t("editTour"), alternates: buildAlternates(locale, `/rentals/listing/${id}/tour`),
    robots: { index: false, follow: false }, openGraph: null, twitter: null,
  };
}

export default async function RentalTourEditorPage({ params }: Props) {
  const { id, locale } = await params;
  setRequestLocale(locale);
  const [{ listing }, t, common] = await Promise.all([
    readOwnedRentalTour(id),
    getTranslations({ locale, namespace: "rentalsPilot" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const { items, labels } = await rentalListingMedia(listing, locale);
  const media = [...new Map(items.map(item => [item.src, item])).values()];
  const available = new Set(media.map(item => item.src));
  const saved = rentalTourFrames.safeParse(listing.tour_frames);
  const curated = saved.success ? saved.data.filter(frame => available.has(frame.src)) : [];
  const automatic = curated.length === 0;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
      <RentalLocaleLink locale={locale} href={`/rentals/listing/${listing.id}`}
        className="inline-flex min-h-11 items-center text-sm underline">{common("back")}</RentalLocaleLink>
      <h1 data-rentals-title className="text-4xl">{t("editTour")}</h1>
      {media.length ? <RentalTourEditor media={media} labels={labels}
        initial={automatic ? automaticRentalTour(media) : curated} automatic={automatic}
        save={saveRentalTour.bind(null, listing.id)} /> : <p>{t("emptyTour")}</p>}
      <RentalLocaleLink locale={locale} href={`/rentals/new?id=${listing.id}`}
        className="inline-flex min-h-11 items-center text-sm underline">{t("editListing")}</RentalLocaleLink>
    </div>
  );
}
