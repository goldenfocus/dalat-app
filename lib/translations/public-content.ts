import "server-only";
import { getTranslations } from "@/lib/translations";
import type {
  ContentLocale,
  TranslationContentType,
  TranslationFieldName,
} from "@/lib/types";

/** Use the requested language only: never label an English fallback as a German translation. */
export async function translatedFields(
  type: TranslationContentType,
  id: string,
  locale: string,
) {
  return getTranslations(type, id, locale as ContentLocale);
}
export async function translatedExperience<
  T extends {
    id: string;
    title: string;
    summary: string;
    narrative: string;
    observations: any[];
    photos: any[];
    sponsorship: string;
  },
>(source: T, locale: string): Promise<T> {
  const values = await translatedFields("experience", source.id, locale);
  const result = { ...source };
  for (const key of ["title", "summary", "narrative", "sponsorship"] as const)
    result[key] = values.get(key) || source[key];
  for (const key of ["observations", "photos"] as const) {
    const raw = values.get(key);
    if (!raw) continue;
    try {
      const translated = JSON.parse(raw);
      if (
        !Array.isArray(translated) ||
        translated.length !== source[key].length
      )
        continue;
      const allowed =
        key === "photos" ? ["alt", "caption"] : ["subject", "value", "context"];
      result[key] = source[key].map((item, index) => ({
        ...item,
        ...Object.fromEntries(
          allowed
            .filter((field) => typeof translated[index]?.[field] === "string")
            .map((field) => [field, translated[index][field]]),
        ),
      }));
    } catch {
      /* Malformed model output must never break the source story. */
    }
  }
  return result;
}

/** One public query for a whole list or menu, instead of one request per card. */
export async function translatedRecords(
  type: TranslationContentType,
  ids: string[],
  locale: string,
) {
  const result = new Map<string, Map<TranslationFieldName, string>>();
  if (!ids.length) return result;
  const { createStaticClient } = await import("@/lib/supabase/server");
  const db = createStaticClient();
  if (!db) return result;
  const { data, error } = await db
    .from("content_translations")
    .select("content_id,field_name,translated_text")
    .eq("content_type", type)
    .eq("target_locale", locale)
    .in("content_id", ids);
  if (error) throw new Error("Translation lookup failed");
  for (const row of data || []) {
    const fields = result.get(row.content_id) || new Map();
    fields.set(row.field_name, row.translated_text);
    result.set(row.content_id, fields);
  }
  return result;
}
