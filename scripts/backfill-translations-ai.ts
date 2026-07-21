/**
 * Bulk translation backfill — run ON the Mac mini for full local speed
 * (talks to the Ollama proxy on localhost, no tunnel round-trip).
 *
 *   LOCAL_AI_URL=http://127.0.0.1:11501 LOCAL_AI_TOKEN=$(cat ~/dalat-ai-proxy/secret.txt) \
 *     npx tsx --tsconfig tsconfig.json scripts/backfill-translations-ai.ts
 *
 * Idempotent: upserts per (content, locale, field) and re-checks coverage on
 * every loop, so it can run alongside the translate-pending cron. The work
 * list (including moment caption fields) comes from lib/translation-sweep.ts,
 * shared with that cron.
 */
import { createClient } from "@supabase/supabase-js";
import { translateFieldsToLocale, detectLanguage } from "@/lib/google-translate";
import { collectTranslationWork } from "@/lib/translation-sweep";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aljcmodwjqlznzcydyor.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SCAN_LIMIT = 200;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  let round = 0;
  while (true) {
    const work = await collectTranslationWork(supabase, SCAN_LIMIT);
    if (work.length === 0) {
      console.log("Backfill complete — no pending items.");
      break;
    }
    round++;
    const units = work.reduce((n, w) => n + w.missingLocales.length, 0);
    console.log(`Round ${round}: ${work.length} items, ${units} locale-units pending`);

    for (const item of work) {
      const src = item.sourceLocale ?? (await detectLanguage(item.fields[0].text));
      for (const locale of item.missingLocales) {
        const t0 = Date.now();
        try {
          const translated =
            locale === src
              ? Object.fromEntries(item.fields.map((f) => [f.field_name, f.text]))
              : await translateFieldsToLocale(item.fields, locale);
          const inserts = item.fields
            .filter((f) => translated[f.field_name])
            .map((f) => ({
              content_type: item.contentType,
              content_id: item.contentId,
              source_locale: src,
              target_locale: locale,
              field_name: f.field_name,
              translated_text: translated[f.field_name],
              translation_status: "auto",
            }));
          if (inserts.length) {
            const { error } = await supabase.from("content_translations").upsert(inserts, {
              onConflict: "content_type,content_id,target_locale,field_name",
            });
            if (error) throw error;
          }
          console.log(`  ✓ ${item.contentType}:${item.contentId.slice(0, 8)} ${locale} (${Math.round((Date.now() - t0) / 1000)}s)`);
        } catch (err) {
          console.error(`  ✗ ${item.contentType}:${item.contentId.slice(0, 8)} ${locale}: ${String(err).slice(0, 150)}`);
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
