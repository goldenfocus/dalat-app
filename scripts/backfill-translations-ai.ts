/**
 * Bulk translation backfill — run ON the Mac mini for full local speed
 * (talks to the Ollama proxy on localhost, no tunnel round-trip).
 *
 *   LOCAL_AI_URL=http://127.0.0.1:11501 LOCAL_AI_TOKEN=$(cat ~/dalat-ai-proxy/secret.txt) \
 *     npx tsx --tsconfig tsconfig.json scripts/backfill-translations-ai.ts
 *
 * Idempotent: upserts per (content, locale, field) and re-checks coverage on
 * every loop, so it can run alongside the translate-pending cron.
 */
import { createClient } from "@supabase/supabase-js";
import { translateFieldsToLocale, detectLanguage } from "@/lib/google-translate";
import { CONTENT_LOCALES, ContentLocale } from "@/lib/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aljcmodwjqlznzcydyor.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SCAN_LIMIT = 200;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

interface Item {
  contentType: "blog" | "event" | "moment";
  contentId: string;
  sourceLocale: ContentLocale | null;
  fields: { field_name: string; text: string }[];
  missingLocales: ContentLocale[];
}

async function collectWork(): Promise<Item[]> {
  const candidates: Omit<Item, "missingLocales">[] = [];

  const { data: posts } = await supabase
    .from("blog_posts")
    .select("id, title, story_content, technical_content, meta_description, source_locale")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(SCAN_LIMIT);
  for (const p of posts ?? []) {
    const fields = [
      { field_name: "title", text: p.title },
      { field_name: "story_content", text: p.story_content },
      { field_name: "technical_content", text: p.technical_content },
      { field_name: "meta_description", text: p.meta_description },
    ].filter((f) => f.text?.trim());
    if (fields.length) candidates.push({ contentType: "blog", contentId: p.id, sourceLocale: p.source_locale, fields });
  }

  const { data: events } = await supabase
    .from("events")
    .select("id, title, description, source_locale")
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);
  for (const e of events ?? []) {
    const fields = [
      { field_name: "title", text: e.title },
      { field_name: "description", text: e.description },
    ].filter((f) => f.text?.trim());
    if (fields.length) candidates.push({ contentType: "event", contentId: e.id, sourceLocale: e.source_locale, fields });
  }

  const { data: moments } = await supabase
    .from("moments")
    .select("id, text_content, source_locale")
    .not("text_content", "is", null)
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);
  for (const m of moments ?? []) {
    if (!m.text_content?.trim()) continue;
    candidates.push({
      contentType: "moment",
      contentId: m.id,
      sourceLocale: m.source_locale,
      fields: [{ field_name: "text_content", text: m.text_content }],
    });
  }

  const ids = candidates.map((c) => c.contentId);
  const covered = new Map<string, Map<string, number>>();
  for (let i = 0; i < ids.length; i += 50) {
    const { data: rows } = await supabase
      .from("content_translations")
      .select("content_type, content_id, target_locale")
      .in("content_id", ids.slice(i, i + 50));
    for (const r of rows ?? []) {
      const key = `${r.content_type}:${r.content_id}`;
      const per = covered.get(key) ?? new Map();
      per.set(r.target_locale, (per.get(r.target_locale) ?? 0) + 1);
      covered.set(key, per);
    }
  }

  return candidates
    .map((c) => ({
      ...c,
      missingLocales: CONTENT_LOCALES.filter(
        (l) => (covered.get(`${c.contentType}:${c.contentId}`)?.get(l) ?? 0) < c.fields.length
      ),
    }))
    .filter((c) => c.missingLocales.length > 0);
}

async function main() {
  let round = 0;
  while (true) {
    const work = await collectWork();
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
