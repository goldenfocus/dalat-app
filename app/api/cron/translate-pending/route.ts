import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { batchTranslateFields } from '@/lib/google-translate';
import { CONTENT_LOCALES, ContentLocale } from '@/lib/types';

/**
 * Self-healing translation cron.
 *
 * Finds published content whose content_translations coverage is incomplete
 * and translates it via the free AI provider chain, newest first, until the
 * time budget runs out. This both handles new content (news-process no longer
 * translates inline) and gradually backfills any historical gaps.
 */

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const maxDuration = 300;

/** Stop picking up new items after this much of the budget is spent */
const TIME_BUDGET_MS = 240_000;
/** Max content items examined per content type per run */
const SCAN_LIMIT = 25;

interface WorkItem {
  contentType: 'blog' | 'event' | 'moment';
  contentId: string;
  sourceLocale: ContentLocale | null;
  fields: { field_name: string; text: string }[];
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
  const done: string[] = [];
  let errors = 0;

  try {
    const work = await collectWork(supabase);

    for (const item of work) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;

      try {
        const { detectedLocale, translations } = await batchTranslateFields(
          item.fields,
          item.sourceLocale ?? undefined
        );

        const inserts: Record<string, string>[] = [];
        for (const locale of CONTENT_LOCALES) {
          const localeTranslations = translations[locale];
          if (!localeTranslations) continue;
          for (const field of item.fields) {
            const translatedText = localeTranslations[field.field_name];
            if (!translatedText) continue;
            inserts.push({
              content_type: item.contentType,
              content_id: item.contentId,
              source_locale: detectedLocale,
              target_locale: locale,
              field_name: field.field_name,
              translated_text: translatedText,
              translation_status: 'auto',
            });
          }
        }

        if (inserts.length > 0) {
          const { error } = await supabase
            .from('content_translations')
            .upsert(inserts, {
              onConflict: 'content_type,content_id,target_locale,field_name',
            });
          if (error) throw error;
        }

        done.push(`${item.contentType}:${item.contentId}`);
        console.log(
          `[translate-pending] ${item.contentType}:${item.contentId} -> ${inserts.length} rows`
        );
      } catch (err) {
        errors++;
        console.error(`[translate-pending] ${item.contentType}:${item.contentId} failed:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      pending_found: work.length,
      translated: done.length,
      errors,
      elapsed_s: Math.round((Date.now() - startedAt) / 1000),
    });
  } catch (error) {
    console.error('[translate-pending] Fatal error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Collect content items with incomplete translation coverage, newest first.
 */
async function collectWork(
  supabase: ReturnType<typeof getSupabase>
): Promise<WorkItem[]> {
  const work: WorkItem[] = [];

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
    if (await isIncomplete(supabase, 'blog', post.id, fields.length)) {
      work.push({ contentType: 'blog', contentId: post.id, sourceLocale: post.source_locale, fields });
    }
  }

  // --- Events (upcoming and recent) ---
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
    if (await isIncomplete(supabase, 'event', event.id, fields.length)) {
      work.push({ contentType: 'event', contentId: event.id, sourceLocale: event.source_locale, fields });
    }
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
    const fields = [{ field_name: 'text_content', text: moment.text_content }];
    if (await isIncomplete(supabase, 'moment', moment.id, fields.length)) {
      work.push({ contentType: 'moment', contentId: moment.id, sourceLocale: moment.source_locale, fields });
    }
  }

  return work;
}

/**
 * A content item is incomplete when it has fewer translation rows than
 * fields x locales.
 */
async function isIncomplete(
  supabase: ReturnType<typeof getSupabase>,
  contentType: string,
  contentId: string,
  fieldCount: number
): Promise<boolean> {
  const { count } = await supabase
    .from('content_translations')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', contentType)
    .eq('content_id', contentId);
  return (count ?? 0) < fieldCount * CONTENT_LOCALES.length;
}
