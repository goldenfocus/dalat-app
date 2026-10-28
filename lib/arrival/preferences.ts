import "server-only";
import { arrivalAdmin } from "./server";
import { languagePreferencesSchema, type LanguagePreferences } from "./languages";

export async function getLanguagePreferences(userId: string): Promise<LanguagePreferences | null> {
  const admin = arrivalAdmin();
  const { data, error } = await admin.from("language_exchange_preferences").select("practice_language,english_level,vietnamese_level").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  // Older attendees can reuse the answers they already gave at check-in.
  const previous = data ? null : await admin.from("event_arrival_participants").select("practice_language,english_level,vietnamese_level").eq("user_id", userId).order("checked_in_at", { ascending: false }).limit(1).maybeSingle();
  if (previous?.error) throw previous.error;
  const row = data || previous?.data;
  const parsed = languagePreferencesSchema.safeParse(row && { practiceLanguage: row.practice_language, englishLevel: row.english_level, vietnameseLevel: row.vietnamese_level });
  return parsed.success ? parsed.data : null;
}
