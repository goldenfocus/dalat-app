"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect, type Locale } from "@/lib/i18n/routing";
import { rentalListingMedia } from "@/components/rentals/listing-media";
import { rentalTourFrames, type RentalTourFrame } from "@/lib/rentals/tour";
import { readOwnedRentalTour } from "./owner";

export async function saveRentalTour(id: string, _previous: "failed" | null, form: FormData): Promise<"failed"> {
  const { db, listing, ownerId } = await readOwnedRentalTour(id);
  const mode = form.get("mode");
  if (mode !== "automatic" && mode !== "curated") return "failed";
  const locale = await getLocale() as Locale;
  let frames: RentalTourFrame[] | null = null;
  let photos: string[] = [];
  let videos: string[] = [];

  if (mode === "curated") {
    const serialized = form.get("frames");
    if (typeof serialized !== "string" || serialized.length > 24_000) return "failed";
    let input: unknown;
    try {
      input = JSON.parse(serialized);
    } catch {
      return "failed";
    }
    const parsed = rentalTourFrames.safeParse(input);
    if (!parsed.success) return "failed";

    const { items } = await rentalListingMedia(listing, locale);
    const requested = new Set(parsed.data.map(frame => frame.src));
    const selected = new Map(items.filter(item => requested.has(item.src)).map(item => [item.src, item]));
    if (selected.size !== requested.size) return "failed";
    frames = parsed.data;
    photos = [...selected.values()].filter(item => item.kind === "photo").map(item => item.src);
    videos = [...selected.values()].filter(item => item.stream).map(item => item.src.slice("/api/rentals/videos/".length));
  }

  // Guard against an overlapping edit that removes media after the ownership check.
  let update = db.from("rental_listings").update({ tour_frames: frames }).eq("id", listing.id).eq("host_id", ownerId);
  if (photos.length) update = update.contains("photos", photos);
  if (videos.length) update = update.contains("videos", videos);
  const { data, error } = await update.select("status").maybeSingle();
  if (error || !data) return "failed";

  revalidatePath("/[locale]/rentals", "page");
  revalidatePath("/[locale]/rentals/listing/[id]", "page");
  return redirect({
    href: data.status === "published" ? `/rentals?browse=tours#listing-${listing.id}` : `/rentals/listing/${listing.id}`,
    locale,
  });
}
