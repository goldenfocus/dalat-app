/**
 * Backfill translations for all events using Google Cloud Translation API
 *
 * Usage:
 *   bun run scripts/backfill-translations.ts [--dry-run] [--limit=10]
 *
 * This script:
 * 1. Fetches all events from the database
 * 2. Translates title and description to all 12 supported languages
 * 3. Stores translations in content_translations table
 *
 * Flags:
 *   --dry-run   Show what would be translated without making changes
 *   --limit=N   Only process N events (useful for testing)
 *   --force     Re-translate events that already have translations
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

async function translateEvent(
  event: { id: string; title: string; description: string | null },
  apiKey: string,
  dryRun: boolean,
  supabase: ReturnType<typeof createClient>
): Promise<{ success: boolean; translationsCount: number; detectedLocale: ContentLocale }> {
  // Detect source language from title
  const detectedLocale = await detectLanguage(event.title, apiKey);

  const fieldsToTranslate = [
    { field_name: "title", text: event.title },
    ...(event.description ? [{ field_name: "description", text: event.description }] : []),
  ];

  const translationInserts: {
    content_type: string;
    content_id: string;
    source_locale: string;
    target_locale: string;
    field_name: string;
    translated_text: string;
    translation_status: string;
  }[] = [];

  // Translate to all locales
  for (const locale of CONTENT_LOCALES) {
    for (const field of fieldsToTranslate) {
      let translatedText: string;

      if (locale === detectedLocale) {
        // No translation needed for source language
        translatedText = field.text;
      } else {
        translatedText = await translateText(field.text, locale, detectedLocale, apiKey);
        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 50));
      }

      translationInserts.push({
        content_type: "event",
        content_id: event.id,
        source_locale: detectedLocale,
        target_locale: locale,
        field_name: field.field_name,
        translated_text: translatedText,
        translation_status: "auto",
      });
    }
  }

  if (!dryRun) {
    // Update source_locale on the event
    await supabase.from("events").update({ source_locale: detectedLocale }).eq("id", event.id);

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
║     Backfill Event Translations (Google Translate API)         ║
╠════════════════════════════════════════════════════════════════╣
║  Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE (will update database)"}
║  Force re-translate: ${force ? "YES" : "NO"}
║  Limit: ${limit ? limit + " events" : "All events"}
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

  // Get events that need translation
  let query = supabase.from("events").select("id, title, description, source_locale").order("created_at", { ascending: false });

  if (!force) {
    // Only get events without source_locale (not yet translated)
    query = query.is("source_locale", null);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data: events, error: eventsError } = await query;

  if (eventsError) {
    console.error("❌ Failed to fetch events:", eventsError.message);
    process.exit(1);
  }

  console.log(`Found ${events?.length ?? 0} events to translate\n`);

  if (!events || events.length === 0) {
    console.log("✅ Nothing to translate!");
    process.exit(0);
  }

  let successful = 0;
  let failed = 0;
  let totalTranslations = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const progress = `[${i + 1}/${events.length}]`;

    try {
      console.log(`${progress} Translating "${event.title?.substring(0, 50)}..."`);

      const result = await translateEvent(event, googleApiKey, dryRun, supabase);

      console.log(`   ✓ Detected: ${result.detectedLocale}, ${result.translationsCount} translations`);
      successful++;
      totalTranslations += result.translationsCount;

      // Delay between events to avoid rate limits
      if (i < events.length - 1) {
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
║  Events processed: ${events.length.toString().padEnd(41)}
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
