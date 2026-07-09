import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { translateFieldsToLocale, detectLanguage } from '@/lib/google-translate';
import { CONTENT_LOCALES, ContentLocale } from '@/lib/types';

/**
 * Self-healing translation cron.
 *
 * Finds published content whose content_translations coverage is incomplete
 * and translates it via the free AI provider chain, newest first, one locale
 * at a time so every unit of work is upserted immediately (a long blog post
 * can take minutes per locale on the local model — nothing is lost when the
 * time budget cuts a run short). Handles new content (news-process no longer
 * translates inline) and gradually backfills historical gaps.
 */

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const maxDuration = 300;

/** Stop starting new locale translations after this much time.
 * Cloudflare cron invocations get up to 15 min wall clock — long blog posts
 * take ~2.5 min per locale on the local model. */
const TIME_BUDGET_MS = 720_000;
/** Max content items examined per content type per run */
const SCAN_LIMIT = 25;

interface WorkItem {
  contentType: 'blog' | 'event' | 'moment';
  contentId: string;
  sourceLocale: ContentLocale | null;
  fields: { field_name: string; text: string }[];
  missingLocales: ContentLocale[];
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const startedAt = Date.now();
  let localesDone = 0;
  let errors = 0;

  try {
    const work = await collectWork(supabase);

    // Diagnostic mode: report the work list without translating
    if (new URL(request.url).searchParams.has('scan')) {
      return NextResponse.json({
        scan: true,
        elapsed_s: Math.round((Date.now() - startedAt) / 1000),
        pending: work.map(
          (w) => `${w.contentType}:${w.contentId} (${w.missingLocales.length} locales)`
        ),
      });
    }

    outer: for (const item of work) {
      const sourceLocale =
        item.sourceLocale ?? (await detectLanguage(item.fields[0].text));

      for (const locale of item.missingLocales) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) break outer;

        try {
          const translated =
            locale === sourceLocale
              ? Object.fromEntries(item.fields.map((f) => [f.field_name, f.text]))
              : await translateFieldsToLocale(item.fields, locale);

          const inserts = item.fields
            .filter((f) => translated[f.field_name])
            .map((f) => ({
              content_type: item.contentType,
              content_id: item.contentId,
              source_locale: sourceLocale,
              target_locale: locale,
              field_name: f.field_name,
              translated_text: translated[f.field_name],
              translation_status: 'auto',
            }));

          if (inserts.length > 0) {
            const { error } = await supabase
              .from('content_translations')
              .upsert(inserts, {
                onConflict: 'content_type,content_id,target_locale,field_name',
              });
            if (error) throw error;
            localesDone++;
          }
        } catch (err) {
          errors++;
          console.error(
            `[translate-pending] ${item.contentType}:${item.contentId} ${locale} failed:`,
            err
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      pending_items: work.length,
      locales_translated: localesDone,
      errors,
      elapsed_s: Math.round((Date.now() - startedAt) / 1000),
    });
  } catch (error) {
    console.error('[translate-pending] Fatal error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Collect content items with missing translation locales, newest first.
 */
async function collectWork(
  supabase: ReturnType<typeof getSupabase>
): Promise<WorkItem[]> {
  const candidates: Omit<WorkItem, 'missingLocales'>[] = [];

  // --- Blog posts ---
  const { data: posts } = await supabase
    .from('blog_posts')
    .select('id, title, story_content, technical_content, meta_description, source_locale')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(SCAN_LIMIT);

  for (const post of posts ?? []) {
    const fields = [
      { field_name: 'title', text: post.title },
      { field_name: 'story_content', text: post.story_content },
      { field_name: 'technical_content', text: post.technical_content },
      { field_name: 'meta_description', text: post.meta_description },
    ].filter((f) => f.text && f.text.trim().length > 0);
    if (fields.length === 0) continue;
    candidates.push({ contentType: 'blog', contentId: post.id, sourceLocale: post.source_locale, fields });
  }

  // --- Events (newest first) ---
  const { data: events } = await supabase
    .from('events')
    .select('id, title, description, source_locale')
    .order('created_at', { ascending: false })
    .limit(SCAN_LIMIT);

  for (const event of events ?? []) {
    const fields = [
      { field_name: 'title', text: event.title },
      { field_name: 'description', text: event.description },
    ].filter((f) => f.text && f.text.trim().length > 0);
    if (fields.length === 0) continue;
    candidates.push({ contentType: 'event', contentId: event.id, sourceLocale: event.source_locale, fields });
  }

  // --- Moments ---
  const { data: moments } = await supabase
    .from('moments')
    .select('id, text_content, source_locale')
    .not('text_content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(SCAN_LIMIT);

  for (const moment of moments ?? []) {
    if (!moment.text_content?.trim()) continue;
    candidates.push({
      contentType: 'moment',
      contentId: moment.id,
      sourceLocale: moment.source_locale,
      fields: [{ field_name: 'text_content', text: moment.text_content }],
    });
  }

  // One query for existing coverage of ALL candidates (per-item HEAD count
  // queries hang from workerd, and one GET is faster anyway). A locale is
  // complete when it has a row for every field of the item.
  const ids = candidates.map((c) => c.contentId);
  const covered = new Map<string, Map<string, number>>();
  for (let i = 0; i < ids.length; i += 50) {
    const { data: rows } = await supabase
      .from('content_translations')
      .select('content_type, content_id, target_locale')
      .in('content_id', ids.slice(i, i + 50));
    for (const row of rows ?? []) {
      const key = `${row.content_type}:${row.content_id}`;
      const perLocale = covered.get(key) ?? new Map<string, number>();
      perLocale.set(row.target_locale, (perLocale.get(row.target_locale) ?? 0) + 1);
      covered.set(key, perLocale);
    }
  }

  const work: WorkItem[] = [];
  for (const c of candidates) {
    const perLocale = covered.get(`${c.contentType}:${c.contentId}`);
    const missingLocales = CONTENT_LOCALES.filter(
      (locale) => (perLocale?.get(locale) ?? 0) < c.fields.length
    );
    if (missingLocales.length > 0) {
      work.push({ ...c, missingLocales });
    }
  }
  return work;
}
