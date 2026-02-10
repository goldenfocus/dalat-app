/**
 * Backfill translations for all venues using Google Cloud Translation API
 *
 * Usage:
 *   bun run scripts/backfill-venue-translations.ts [--dry-run] [--limit=10]
 *
 * This script:
 * 1. Fetches all venues with descriptions from the database
 * 2. Translates description to all 12 supported languages
 * 3. Stores translations in content_translations table
 *
 * Note: Venue names are proper names and should NOT be translated
 *
 * Flags:
 *   --dry-run   Show what would be translated without making changes
 *   --limit=N   Only process N venues (useful for testing)
 *   --force     Re-translate venues that already have translations
 */

import { createClient } from "@supabase/supabase-js";

const GOOGLE_TRANSLATE_API = "https://translation.googleapis.com/language/translate/v2";

const CONTENT_LOCALES = ["en", "vi", "ko", "zh", "ru", "fr", "ja", "ms", "th", "de", "es", "id"] as const;
type ContentLocale = (typeof CONTENT_LOCALES)[number];

interface GoogleTranslateResponse {
  data: {
    translations: {
      translatedText: string;
      detectedSourceLanguage?: string;
    }[];
  };
}

interface GoogleDetectResponse {
  data: {
    detections: {
      language: string;
      confidence: number;
    }[][];
  };
}

// Map our ContentLocale to Google Translate language codes
function mapToGoogleCode(locale: ContentLocale): string {
  const mapping: Record<ContentLocale, string> = {
    en: "en",
    vi: "vi",
    ko: "ko",
    zh: "zh-CN",
    ru: "ru",
    fr: "fr",
    ja: "ja",
    ms: "ms",
    th: "th",
    de: "de",
    es: "es",
    id: "id",
  };
  return mapping[locale] || locale;
}

// Map Google's language codes back to our ContentLocale
function mapToContentLocale(googleCode: string): ContentLocale {
  const mapping: Record<string, ContentLocale> = {
    en: "en",
    vi: "vi",
    ko: "ko",
    "zh-CN": "zh",
    "zh-TW": "zh",
    zh: "zh",
    ru: "ru",
    fr: "fr",
    ja: "ja",
    ms: "ms",
    th: "th",
    de: "de",
    es: "es",
    id: "id",
  };
  return mapping[googleCode] || "en";
}

async function detectLanguage(text: string, apiKey: string): Promise<ContentLocale> {
  const response = await fetch(`${GOOGLE_TRANSLATE_API}/detect?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Translate detect failed: ${error}`);
  }

  const result: GoogleDetectResponse = await response.json();
  const detected = result.data.detections[0]?.[0]?.language || "en";
  return mapToContentLocale(detected);
}

async function translateText(
  text: string,
  targetLocale: ContentLocale,
  _sourceLocale: ContentLocale,
  apiKey: string
): Promise<string> {
  // Don't pass `source` — let Google auto-detect per call.
  // Forcing a misdetected source produces garbage translations.
  const params = {
    q: text,
    target: mapToGoogleCode(targetLocale),
    format: "text",
  };

  const response = await fetch(`${GOOGLE_TRANSLATE_API}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Translate failed: ${error}`);
  }

  const result: GoogleTranslateResponse = await response.json();
  return result.data.translations[0].translatedText;
}

async function translateVenue(
  venue: { id: string; name: string; description: string },
  apiKey: string,
  dryRun: boolean,
  supabase: ReturnType<typeof createClient>
): Promise<{ success: boolean; translationsCount: number; detectedLocale: ContentLocale }> {
  // Detect source language from description
  const detectedLocale = await detectLanguage(venue.description, apiKey);

  // Only translate description - venue names are proper names
  const fieldsToTranslate = [{ field_name: "description", text: venue.description }];

  const translationInserts: {
    content_type: string;
    content_id: string;
    source_locale: string;
    target_locale: string;
    field_name: string;
    translated_text: string;
    translation_status: string;
  }[] = [];

  // Translate to all locales except the source locale
  for (const locale of CONTENT_LOCALES) {
    // Skip same-language translations
    if (locale === detectedLocale) continue;

    for (const field of fieldsToTranslate) {
      const translatedText = await translateText(field.text, locale, detectedLocale, apiKey);
      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 50));

      translationInserts.push({
        content_type: "venue",
        content_id: venue.id,
        source_locale: detectedLocale,
        target_locale: locale,
        field_name: field.field_name,
        translated_text: translatedText,
        translation_status: "auto",
      });
    }
  }

  if (!dryRun) {
    // Update source_locale on the venue
    await supabase.from("venues").update({ source_locale: detectedLocale }).eq("id", venue.id);

    // Upsert translations
    const { error: insertError } = await supabase.from("content_translations").upsert(translationInserts, {
      onConflict: "content_type,content_id,target_locale,field_name",
    });

    if (insertError) {
      throw new Error(`Failed to insert translations: ${insertError.message}`);
    }
  }

  return {
    success: true,
    translationsCount: translationInserts.length,
    detectedLocale,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║     Backfill Venue Translations (Google Translate API)         ║
╠════════════════════════════════════════════════════════════════╣
║  Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE (will update database)"}
║  Force re-translate: ${force ? "YES" : "NO"}
║  Limit: ${limit ? limit + " venues" : "All venues"}
╚════════════════════════════════════════════════════════════════╝
`);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const googleApiKey = process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  if (!googleApiKey) {
    console.error("❌ Missing GOOGLE_CLOUD_TRANSLATION_API_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get venues that need translation (only those with descriptions)
  let query = supabase
    .from("venues")
    .select("id, name, description, source_locale")
    .not("description", "is", null)
    .order("created_at", { ascending: false });

  if (!force) {
    // Only get venues without source_locale (not yet translated)
    query = query.is("source_locale", null);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data: venues, error: venuesError } = await query;

  if (venuesError) {
    console.error("❌ Failed to fetch venues:", venuesError.message);
    process.exit(1);
  }

  console.log(`Found ${venues?.length ?? 0} venues to translate\n`);

  if (!venues || venues.length === 0) {
    console.log("✅ Nothing to translate!");
    process.exit(0);
  }

  let successful = 0;
  let failed = 0;
  let totalTranslations = 0;

  for (let i = 0; i < venues.length; i++) {
    const venue = venues[i];
    const progress = `[${i + 1}/${venues.length}]`;

    try {
      console.log(`${progress} Translating "${venue.name?.substring(0, 50)}..."`);

      const result = await translateVenue(
        { id: venue.id, name: venue.name, description: venue.description! },
        googleApiKey,
        dryRun,
        supabase
      );

      console.log(`   ✓ Detected: ${result.detectedLocale}, ${result.translationsCount} translations`);
      successful++;
      totalTranslations += result.translationsCount;

      // Delay between venues to avoid rate limits
      if (i < venues.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (error) {
      console.error(`   ❌ Failed:`, error instanceof Error ? error.message : error);
      failed++;
    }
  }

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    Translation Summary                         ║
╠════════════════════════════════════════════════════════════════╣
║  Venues processed: ${venues.length.toString().padEnd(41)}
║  Successful: ${successful.toString().padEnd(48)}
║  Failed: ${failed.toString().padEnd(52)}
║  Total translations created: ${totalTranslations.toString().padEnd(31)}
╚════════════════════════════════════════════════════════════════╝
`);

  if (dryRun) {
    console.log("💡 This was a DRY RUN. Run without --dry-run to apply changes.\n");
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
