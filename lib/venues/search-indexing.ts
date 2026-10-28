import type { SupabaseClient } from "@supabase/supabase-js";
import { locales } from "@/lib/i18n/locales";
import type { Locale } from "@/lib/i18n/routing";

export type VenueSearchSource = {
  id: string;
  description: string | null;
  source_locale?: string | null;
  updated_at: string;
};
export type VenueSearchTranslation = {
  content_id: string;
  target_locale: string;
  translated_text: string;
  updated_at: string;
};

/** RLS hides obsolete/human-stale translations. Missing prose never becomes a foreign-language SEO promise. */
export function venueSearchLocales(
  venue: VenueSearchSource,
  rows: VenueSearchTranslation[],
) {
  const sourceLocale = venue.source_locale || "und";
  return locales.filter(
    (locale) =>
      !venue.description?.trim() ||
      locale === sourceLocale ||
      rows.some(
        (row) =>
          row.content_id === venue.id &&
          row.target_locale === locale &&
          row.translated_text.trim(),
      ),
  );
}

export function venueSearchModifiedAt(
  venue: VenueSearchSource,
  locale: Locale,
  rows: VenueSearchTranslation[],
) {
  return rows
    .filter(
      (row) => row.content_id === venue.id && row.target_locale === locale,
    )
    .reduce(
      (latest, row) =>
        Number.isFinite(Date.parse(row.updated_at)) &&
        Date.parse(row.updated_at) > Date.parse(latest)
          ? row.updated_at
          : latest,
      venue.updated_at,
    );
}

/** Anonymous source-visible reads, paged and chunked beyond PostgREST's response cap. */
export async function fetchVenueSearchTranslations(
  db: SupabaseClient,
  ids: string[],
): Promise<VenueSearchTranslation[]> {
  const result: VenueSearchTranslation[] = [];
  const unique = [...new Set(ids)];
  for (let start = 0; start < unique.length; start += 50) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db
        .from("content_translations")
        .select("content_id,target_locale,translated_text,updated_at")
        .eq("content_type", "venue")
        .eq("field_name", "description")
        .in("content_id", unique.slice(start, start + 50))
        .order("id", { ascending: true })
        .range(offset, offset + 999);
      if (error) throw new Error(`Venue search translations: ${error.message}`);
      result.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  return result;
}

/** Page the source list too; translated rows cannot recover omitted venues. */
export async function fetchVenueSearchSources(db: SupabaseClient) {
  const rows: Array<
    VenueSearchSource & { slug: string; cover_photo_url: string | null }
  > = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("venues")
      .select("id,slug,description,source_locale,updated_at,cover_photo_url")
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(`Venue search sources: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
