import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTENT_LOCALES, ContentLocale } from "@/lib/types";

/**
 * Shared work collector for the self-healing translation sweep — used by
 * both /api/cron/translate-pending and scripts/backfill-translations-ai.ts
 * so the two can never disagree about what "untranslated" means.
 *
 * Coverage is counted per (locale, field_name). Counting rows per locale
 * (the old way) broke the moment a moment had BOTH text_content and caption
 * fields: 3 caption rows made an untranslated text_content look covered.
 */

export interface TranslationWorkItem {
  contentType: "blog" | "event" | "moment";
  contentId: string;
  sourceLocale: ContentLocale | null;
  fields: { field_name: string; text: string }[];
  missingLocales: ContentLocale[];
}

/** Machine captions fan out from these moment_metadata columns. */
export const CAPTION_FIELDS = [
  "ai_description",
  "ai_title",
  "scene_description",
  "video_summary",
  "video_transcript",
  "audio_summary",
  "audio_transcript",
  "pdf_summary",
  "pdf_extracted_text",
] as const;

/** Long transcripts are capped like the old inline fan-out capped them. */
const MAX_FIELD_LENGTH = 5000;

function cap(text: string): string {
  return text.length > MAX_FIELD_LENGTH ? text.slice(0, MAX_FIELD_LENGTH) : text;
}

/**
 * Collect content whose 12-locale translation coverage is incomplete,
 * newest first. Short user-facing content (events, moments, captions)
 * comes before blogs — a single long post can eat minutes per locale and
 * would starve everything queued behind it.
 */
export async function collectTranslationWork(
  supabase: SupabaseClient,
  scanLimit: number
): Promise<TranslationWorkItem[]> {
  const candidates: Omit<TranslationWorkItem, "missingLocales">[] = [];

  // Candidate queries THROW on error (never `?? []`): an error degraded to
  // "zero candidates" would silently retire a whole content type from the
  // sweep — the exact aggregator-v1 `catch -> []` failure this repo has
  // already lived through.

  // --- Events (newest first) ---
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, title, description, source_locale")
    .order("created_at", { ascending: false })
    .limit(scanLimit);
  if (eventsError) throw new Error(`[translation-sweep] events query failed: ${eventsError.message}`);

  for (const event of events ?? []) {
    const fields = [
      { field_name: "title", text: event.title },
      { field_name: "description", text: event.description },
    ].filter((f) => f.text && f.text.trim().length > 0);
    if (fields.length === 0) continue;
    candidates.push({ contentType: "event", contentId: event.id, sourceLocale: event.source_locale, fields });
  }

  // --- Moments: user-written text (source = the user's language) ---
  const { data: moments, error: momentsError } = await supabase
    .from("moments")
    .select("id, text_content, source_locale")
    .not("text_content", "is", null)
    .order("created_at", { ascending: false })
    .limit(scanLimit);
  if (momentsError) throw new Error(`[translation-sweep] moments query failed: ${momentsError.message}`);

  for (const moment of moments ?? []) {
    if (!moment.text_content?.trim()) continue;
    candidates.push({
      contentType: "moment",
      contentId: moment.id,
      sourceLocale: moment.source_locale,
      fields: [{ field_name: "text_content", text: moment.text_content }],
    });
  }

  // --- Moments: machine captions (always generated in English) ---
  // Separate work item from text_content on purpose: captions are 'en'
  // regardless of the user's source_locale, and the locale===source
  // copy-through shortcut must not paste English captions into vi rows.
  const { data: metadataRows, error: metadataError } = await supabase
    .from("moment_metadata")
    .select(`moment_id, ${CAPTION_FIELDS.join(", ")}`)
    .eq("processing_status", "completed")
    .order("updated_at", { ascending: false })
    .limit(scanLimit);
  if (metadataError) throw new Error(`[translation-sweep] caption query failed: ${metadataError.message}`);

  for (const row of (metadataRows ?? []) as unknown as Array<
    { moment_id: string } & Record<(typeof CAPTION_FIELDS)[number], string | null>
  >) {
    const fields = CAPTION_FIELDS.map((name) => ({
      field_name: name as string,
      text: row[name] ? cap(row[name]!) : "",
    })).filter((f) => f.text.trim().length > 0);
    if (fields.length === 0) continue;
    candidates.push({
      contentType: "moment",
      contentId: row.moment_id,
      sourceLocale: "en",
      fields,
    });
  }

  // --- Blog posts (last — long content) ---
  const { data: posts, error: postsError } = await supabase
    .from("blog_posts")
    .select("id, title, story_content, technical_content, meta_description, source_locale")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(scanLimit);
  if (postsError) throw new Error(`[translation-sweep] blog query failed: ${postsError.message}`);

  for (const post of posts ?? []) {
    const fields = [
      { field_name: "title", text: post.title },
      { field_name: "story_content", text: post.story_content },
      { field_name: "technical_content", text: post.technical_content },
      { field_name: "meta_description", text: post.meta_description },
    ].filter((f) => f.text && f.text.trim().length > 0);
    if (fields.length === 0) continue;
    candidates.push({ contentType: "blog", contentId: post.id, sourceLocale: post.source_locale, fields });
  }

  // One paged query pass for existing coverage of ALL candidates, keyed per
  // (locale, field_name). PostgREST silently caps a response at 1000 rows
  // and truncated rows read as "untranslated" — which made the cron
  // re-translate finished content forever. Page until done.
  const ids = [...new Set(candidates.map((c) => c.contentId))];
  const covered = new Map<string, Map<string, Set<string>>>();
  const PAGE_SIZE = 1000;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data: rows, error } = await supabase
        .from("content_translations")
        .select("content_type, content_id, target_locale, field_name")
        .in("content_id", chunk)
        .order("id")
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        // A partial coverage map would mark done work as missing and burn the
        // whole run re-translating it — bail and let the next run retry.
        throw new Error(`[translation-sweep] coverage query failed: ${error.message}`);
      }
      for (const row of rows ?? []) {
        const key = `${row.content_type}:${row.content_id}`;
        const perLocale = covered.get(key) ?? new Map<string, Set<string>>();
        const fieldSet = perLocale.get(row.target_locale) ?? new Set<string>();
        fieldSet.add(row.field_name);
        perLocale.set(row.target_locale, fieldSet);
        covered.set(key, perLocale);
      }
      if (!rows || rows.length < PAGE_SIZE) break;
    }
  }

  const work: TranslationWorkItem[] = [];
  for (const c of candidates) {
    const perLocale = covered.get(`${c.contentType}:${c.contentId}`);
    const missingLocales = CONTENT_LOCALES.filter((locale) => {
      const fieldSet = perLocale?.get(locale);
      return c.fields.some((f) => !fieldSet?.has(f.field_name));
    });
    if (missingLocales.length > 0) {
      work.push({ ...c, missingLocales });
    }
  }
  return work;
}
