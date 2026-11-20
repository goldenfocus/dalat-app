"use server";

import { revalidatePath } from "next/cache";
import { hasLocale } from "next-intl";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { locales, redirect } from "@/lib/i18n/routing";
import { dalatViewingTime, rentalId, safeRentalPhoto } from "@/lib/rentals/data";
import { availabilityTimes } from "@/lib/rentals/calendar";
import { readRentalDetails } from "@/lib/rentals/details";
import { createClient } from "@/lib/supabase/server";

const price = z.coerce.number().int().min(1).max(1_000_000_000);
const listingForm = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(8000),
  monthly_rent: price,
  six_month_rent: price.nullable(),
  yearly_rent: price.nullable(),
  photos: z.array(z.string().max(2048).refine(safeRentalPhoto)).max(6),
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
  const fields = listingForm.safeParse({
    title: form.get("title"), description: form.get("description"),
    monthly_rent: form.get("monthly_rent"), six_month_rent: form.get("six_month_rent") || null,
    yearly_rent: form.get("yearly_rent") || null,
    photos: String(form.get("photos") || "").split(/\r?\n/).map((url) => url.trim()).filter(Boolean),
    source_locale: form.get("source_locale"),
    status: form.get("status") === "published" ? "published" : "draft",
  });
  const details = readRentalDetails(form);
  if (!fields.success || !details.success || form.has("uploading") || fields.data.photos.some(photo => !photo.startsWith("/api/rentals/photos/" + user.id + "/") && id.data !== "c7725f24-49f5-469f-b95f-417b7e5ec3d3")) return redirect({ href: path + (id.success ? "&" : "?") + "error=1", locale });
  const values = { ...fields.data, details: details.data };
  const result = id.success
    ? await db.from("rental_listings").update(values).eq("id", id.data).eq("host_id", user.id).select("id").single()
    : await db.from("rental_listings").insert(values).select("id").single();
  if (!result.data || result.error) return redirect({ href: path + (id.success ? "&" : "?") + "error=1", locale });
  revalidatePath("/[locale]/rentals", "page");
  redirect({ href: `/rentals#listing-${result.data.id}`, locale });
}

export async function requestViewing(form: FormData) {
  const { db, locale } = await signedIn("/rentals");
  const listing = rentalId.safeParse(form.get("listing"));
  const slot = rentalId.nullable().safeParse(form.get("slot") || null);
  const result = listing.success && slot.success
    ? await db.rpc("rental_request_viewing", { listing: listing.data, chosen_slot: slot.data }) : null;
  revalidatePath("/[locale]/rentals", "page");
  redirect({ href: result?.data ? "/rentals?viewing=requested#viewings" : "/rentals?error=1#viewings", locale });
}

export async function addRentalAvailability(form: FormData) {
  const { db, locale } = await signedIn("/rentals");
  const days = form.getAll("day").filter((day): day is string => typeof day === "string");
  const times = availabilityTimes(days, Number(form.get("start")), Number(form.get("end")));
  const result = times.length ? await db.rpc("rental_publish_slots", { times }) : null;
  revalidatePath("/[locale]/rentals", "page");
  redirect({ href: result?.data ? "/rentals#viewings" : "/rentals?error=1#viewings", locale });
}

export async function changeViewing(form: FormData) {
  const { db, locale } = await signedIn("/rentals");
  const visit = rentalId.safeParse(form.get("visit"));
  const next = z.enum(["confirmed", "proposed", "declined", "cancelled"]).safeParse(form.get("next"));
  const result = visit.success && next.success ? await db.rpc("rental_update_viewing", {
    visit: visit.data,
    next_status: next.data,
    proposed_time: next.data === "proposed" ? dalatViewingTime(form.get("proposed_time")) : null,
  }) : null;
  revalidatePath("/[locale]/rentals", "page");
  redirect({ href: result?.data ? "/rentals#viewings" : "/rentals?error=1#viewings", locale });
}
