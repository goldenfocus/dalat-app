import { getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n/routing";
import { RentalLocaleLink } from "./locale-link";
import type { RentalListing } from "@/lib/rentals/data";
import { rentalListingMedia } from "./listing-media";
import { RentalListingPrices } from "./listing-prices";
import { RentalTourMedia } from "./tour-media";

export async function RentalBrowseListing({ listing, strings, locale, owner, tours }: {
  listing: RentalListing; strings?: Map<string, string>; locale: Locale; owner: boolean; tours: boolean;
}) {
  const path = "/rentals/listing/" + listing.id;
  const title = strings?.get("title") || listing.title;
  const description = strings?.get("description") || listing.description;
  const [t, common, media] = await Promise.all([
    getTranslations({ locale, namespace: "rentalsPilot" }), getTranslations({ locale, namespace: "common" }), rentalListingMedia(listing, locale),
  ]);
  const photos = media.items.filter(item => item.kind === "photo");
  const clips = media.items.filter(item => item.kind === "video");
  const cover = photos[0]?.src || clips[0]?.poster;
  if (tours && (photos.length || clips.length)) {
    return (clips.length ? clips : [undefined]).map((clip, index) =>
      <article key={clip?.src ?? listing.id} id={index === 0 ? "listing-" + listing.id : undefined}
        className="mx-auto w-full max-w-2xl space-y-3 rounded-2xl border bg-card p-3">
        <RentalTourMedia clip={clip} photos={photos} labels={media.labels} />
        <h2 data-rentals-title className="break-words text-2xl">{title}</h2>
        <RentalListingPrices locale={locale} listing={listing} />
        <RentalLocaleLink locale={locale} href={path} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-3 font-medium text-primary-foreground">
          {t("viewListing")}
        </RentalLocaleLink>
      </article>);
  }
  if (tours) return null;
  return <article id={"listing-" + listing.id} data-rental-unlisted={listing.status === "draft" ? "" : undefined}
    className="min-w-0 overflow-hidden rounded-2xl border bg-card">
    <RentalLocaleLink locale={locale} href={path} className="group block focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary">
      {cover && <img src={cover} alt="" loading="lazy" className="aspect-[4/3] w-full bg-muted object-cover" />}
      <h2 data-rentals-title className="min-w-0 break-words px-3 pt-3 text-2xl group-hover:underline sm:px-4 sm:pt-4">{title}</h2>
    </RentalLocaleLink>
    <div className="space-y-3 px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
      {listing.status === "draft" && <span className="text-sm text-muted-foreground">{t("unlisted")}</span>}
      <RentalListingPrices locale={locale} listing={listing} />
      {description && <p className="line-clamp-2 break-words text-sm text-muted-foreground">{description}</p>}
      {owner && <RentalLocaleLink locale={locale} href={`/rentals/new?id=${listing.id}`} className="inline-flex min-h-11 items-center rounded-lg border px-3">{common("edit")}</RentalLocaleLink>}
    </div>
  </article>;
}
