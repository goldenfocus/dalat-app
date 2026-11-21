import type { SupabaseClient } from "@supabase/supabase-js";
import { locales } from "@/lib/i18n/locales";
import { fetchRentalSearchTranslations, rentalSearchLocales, type RentalSearchSource } from "@/lib/rentals/search-indexing";
import { rentalListingPath } from "@/lib/rentals/urls";
import { pingIndexNow } from "./indexnow";

export async function notifyRentalSearch(db: SupabaseClient, id: string, withdrawnSlug?: string) {
  if (withdrawnSlug) {
    const path = rentalListingPath({ id, slug: withdrawnSlug, status: "published" });
    await pingIndexNow(["/rentals", ...locales.map(locale => (locale === "en" ? "" : "/" + locale) + path)]);
    return;
  }

  const { data, error } = await db.from("rental_listings")
    .select("id,slug,description,source_locale,status,photos,updated_at")
    .eq("id", id).eq("status", "published").maybeSingle();
  if (error || !data) return;
  const listing = data as RentalSearchSource;
  const rows = await fetchRentalSearchTranslations(db, [id]).catch(() => []);
  const path = rentalListingPath(listing);
  await pingIndexNow(["/rentals", ...rentalSearchLocales(listing, rows)
    .map(locale => (locale === "en" ? "" : "/" + locale) + path)]);
}
