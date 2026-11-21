import type { SupabaseClient } from "@supabase/supabase-js";
import { locales } from "@/lib/i18n/locales";

export type RentalSearchSource = {
  id: string;
  slug: string | null;
  description: string;
  source_locale: string;
  status: string;
  photos: string[];
  updated_at: string;
};
type RentalSearchTranslation = {
  content_id: string;
  field_name: string;
  target_locale: string;
  translated_text: string;
  updated_at: string;
  translation_status: string;
  ai_reviewed_at: string | null;
};

export function rentalSearchLocales(listing: Pick<RentalSearchSource, "id" | "description" | "source_locale" | "status"> & { slug?: string | null }, rows: readonly RentalSearchTranslation[]) {
  if (listing.status !== "published" || !listing.slug) return [];
  const fieldsByLocale = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.content_id !== listing.id || !row.translated_text.trim()
      || (row.translation_status !== "reviewed" && row.translation_status !== "edited" && !row.ai_reviewed_at)) continue;
    const fields = fieldsByLocale.get(row.target_locale) ?? new Set<string>();
    fields.add(row.field_name);
    fieldsByLocale.set(row.target_locale, fields);
  }
  return locales.filter(locale => {
    if (locale === listing.source_locale) return true;
    const fields = fieldsByLocale.get(locale);
    return fields?.has("title") && (!listing.description.trim() || fields.has("description"));
  });
}

export function rentalSearchModifiedAt(listing: RentalSearchSource, locale: string, rows: readonly RentalSearchTranslation[]) {
  const result = rows.reduce((latest, row) =>
    row.content_id === listing.id && row.target_locale === locale && Date.parse(row.updated_at) > Date.parse(latest)
      ? row.updated_at : latest, listing.updated_at);
  return new Date(result);
}

export async function fetchRentalSearchTranslations(db: SupabaseClient, ids: string[]) {
  const rows: RentalSearchTranslation[] = [];
  for (let start = 0; start < ids.length; start += 40) {
    const { data, error } = await db.from("content_translations")
      .select("content_id,field_name,target_locale,translated_text,updated_at,translation_status,ai_reviewed_at")
      .eq("content_type", "rental").eq("is_stale", false)
      .in("field_name", ["title", "description"])
      .in("content_id", ids.slice(start, start + 40));
    if (error) throw new Error(`Rental search translations: ${error.message}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

export async function fetchRentalSearchSources(db: SupabaseClient) {
  const rows: RentalSearchSource[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("rental_listings")
      .select("id,slug,description,source_locale,status,photos,updated_at")
      .eq("status", "published").order("id").range(offset, offset + 999);
    if (error) throw new Error(`Rental search sources: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}
