import { getTranslations } from "next-intl/server";
import type { RentalGalleryItem } from "./gallery";
import { pilotListingId, pilotMedia, safeRentalPhoto, type RentalListing } from "@/lib/rentals/data";

export async function rentalListingMedia(listing: RentalListing, locale: string) {
  const [t, common, details] = await Promise.all([
    getTranslations("rentalsPilot"), getTranslations("common"), getTranslations("rentalsDetails"),
  ]);
  const items: RentalGalleryItem[] = listing.photos.filter(safeRentalPhoto).map((src, index) => ({
    kind: "photo", src, label: t("viewPhoto", { number: index + 1 }),
  }));
  if (listing.id === pilotListingId) {
    items.push({
      kind: "video", src: pilotMedia + "/reel.mp4", poster: pilotMedia + "/photo-5.webp",
      label: t("reel", { name: listing.title }),
      captions: { src: "/api/rentals/reel-captions/" + locale, locale, label: t("captions") },
    });
  }
  for (const [index, uid] of listing.videos.entries()) {
    const src = "/api/rentals/videos/" + uid;
    items.push({ kind: "video", src, poster: src + "?poster", stream: true,
      label: details("viewVideo", { number: index + 1 }) });
  }
  const labels = {
    close: common("close"), previous: common("previousPhoto"), next: common("nextPhoto"),
    reset: t("resetZoom"), play: t("play"), pause: t("pause"), mute: t("mute"), unmute: t("unmute"),
    unavailable: t("videoUnavailable"), processing: details("videoProcessing"),
  };
  return { items, labels, videoTitle: details("videos") };
}
