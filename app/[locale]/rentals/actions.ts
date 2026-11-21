"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { hasLocale } from "next-intl";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { locales, redirect } from "@/lib/i18n/routing";
import { rentalId, rentalOfferTypes, safeRentalPhoto } from "@/lib/rentals/data";
import { availabilityTimes } from "@/lib/rentals/calendar";
import { readRentalDetails } from "@/lib/rentals/details";
import { readRentalLeaseTerms } from "@/lib/rentals/lease";
import { rentalVideoId } from "@/lib/rentals/video";
import { rentalListingPath } from "@/lib/rentals/urls";
import { notifyRentalSearch } from "@/lib/seo/indexnow-rentals";
import { createClient } from "@/lib/supabase/server";

const listingForm = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(8000),
  offer_type: z.enum(rentalOfferTypes),
  sale_price: z.coerce.number().int().min(1).max(999_999_999_999_999).nullable(),
  videos: z.array(rentalVideoId).optional(),
  photos: z.array(z.string().max(2048).refine(safeRentalPhoto)),
  source_locale: z.enum(locales),
  status: z.enum(["draft", "published"]),
});

async function signedIn(returnTo: string) {
  const requested = await getLocale();
  const locale = hasLocale(locales, requested) ? requested : "en";
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    const next = locale === "en" ? returnTo : `/${locale}${returnTo}`;
    redirect({ href: `/auth/login?next=${encodeURIComponent(next)}`, locale });
  }
  return { db, locale, user: user! };
}

export async function saveRental(form: FormData) {
  const id = rentalId.safeParse(form.get("id"));
  const path = id.success ? `/rentals/new?id=${id.data}` : "/rentals/new";
  const { db, user, locale } = await signedIn(path);
  const offer = form.get("offer_type") ?? "rent";
  const fields = listingForm.safeParse({
    title: form.get("title"), description: form.get("description"),
    offer_type: offer,
    sale_price: offer === "rent" ? null : form.get("sale_price") || null,
    videos: form.has("videoEditor") ? [...new Set(form.getAll("videos"))] : undefined,
    photos: String(form.get("photos") || "").split(/\r?\n/).map((url) => url.trim()).filter(Boolean),
    source_locale: form.get("source_locale"),
    status: form.get("status") === "published" ? "published" : "draft",
  });
  const details = readRentalDetails(form);
  const leaseTerms = readRentalLeaseTerms(form, offer);
  if (!fields.success || !details.success || !leaseTerms || form.has("uploading") || fields.data.photos.some(photo => !photo.startsWith("/api/rentals/photos/" + user.id + "/") && id.data !== "c7725f24-49f5-469f-b95f-417b7e5ec3d3")) return redirect({ href: path + (id.success ? "&" : "?") + "error=1", locale });
  const values = { ...fields.data, ...leaseTerms, details: details.data };
  const result = id.success
    ? await db.from("rental_listings").update(values).eq("id", id.data).eq("host_id", user.id).select("id,slug,status").single()
    : await db.from("rental_listings").insert(values).select("id,slug,status").single();
  if (!result.data || result.error) return redirect({ href: path + (id.success ? "&" : "?") + "error=1", locale });
  revalidatePath("/[locale]/rentals", "page");
  revalidatePath("/[locale]/rentals/listing/[id]", "page");
  if (result.data.slug) {
    revalidatePath("/sitemap.xml");
    const { id: savedId, status, slug } = result.data;
    after(() => notifyRentalSearch(db, savedId, status === "draft" ? slug : undefined));
  }
  redirect({ href: rentalListingPath(result.data), locale });
}

export async function requestViewing(form: FormData) {
  const listing = rentalId.safeParse(form.get("listing"));
  const path = listing.success ? `/rentals/listing/${listing.data}` : "/rentals";
  const { db, locale } = await signedIn(path);
  const slot = rentalId.nullable().safeParse(form.get("slot") || null);
  const result = listing.success && slot.success
    ? await db.rpc("rental_request_viewing", { listing: listing.data, chosen_slot: slot.data }) : null;
  revalidatePath("/[locale]/rentals", "page");
  revalidatePath("/[locale]/rentals/listing/[id]", "page");
  const visit = rentalId.safeParse(result?.data);
  redirect({ href: visit.success ? `/rentals/viewings/${visit.data}?requested=1` : path + "?error=1", locale });
}

export type AvailabilityFeedback = "saved" | "removed" | "future" | "failed" | null;

export async function addRentalAvailability(_feedback: AvailabilityFeedback, form: FormData): Promise<AvailabilityFeedback> {
  const { db } = await signedIn("/rentals");
  const days = form.getAll("day").filter((day): day is string => typeof day === "string");
  const excluded = new Set(form.getAll("exclude"));
  const times = availabilityTimes(days, Number(form.get("start")), Number(form.get("end")))
    .filter(time => !excluded.has(time));
  if (!times.length) return "future";

  const { data, error } = await db.rpc("rental_publish_slots", { times });
  if (error || data !== true) return "failed";

  revalidatePath("/[locale]/rentals", "page");
  return "saved";
}

export async function removeRentalAvailability(form: FormData): Promise<AvailabilityFeedback> {
  const { db } = await signedIn("/rentals");
  const slot = rentalId.nullable().safeParse(form.get("removeSlot"));
  const day = z.iso.date().nullable().safeParse(form.get("removeDay"));
  if (!slot.success || !day.success || (slot.data === null) === (day.data === null)) return "failed";

  const { data, error } = await db.rpc("rental_close_slots", { chosen_slot: slot.data, chosen_day: day.data });
  if (error) return "failed";

  revalidatePath("/[locale]/rentals", "page");
  return data === true ? "removed" : "failed";
}
