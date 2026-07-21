import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { translateFieldsToLocale, detectLanguage } from '@/lib/google-translate';
import { collectTranslationWork } from '@/lib/translation-sweep';
import { sendTelegram } from '@/lib/alerts/telegram';

/**
 * Self-healing translation cron.
 *
 * Finds published content whose content_translations coverage is incomplete
 * and translates it via the free AI provider chain, newest first, one locale
 * at a time so every unit of work is upserted immediately (a long blog post
 * can take minutes per locale on the local model — nothing is lost when the
 * time budget cuts a run short). Handles new content (news-process no longer
 * translates inline, and process-moments never fans captions out itself)
 * and gradually backfills historical gaps. The work list — including moment
 * caption fields — comes from lib/translation-sweep.ts, shared with the
 * Mac mini bulk backfill script.
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
  // Copy-through (locale === source) inserts are free and always succeed —
  // only model-produced translations prove the provider chain is alive.
  let modelLocalesDone = 0;
  let errors = 0;

  try {
    const work = await collectTranslationWork(supabase, SCAN_LIMIT);

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
          const isCopyThrough = locale === sourceLocale;
          const translated = isCopyThrough
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
            if (!isCopyThrough) modelLocalesDone++;
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

    // Cron transports swallow HTTP statuses, so total failure must alert
    // itself — otherwise a dead provider chain leaves captions English-only
    // in 11 locales with every signal green. Judged on MODEL translations:
    // copy-through rows always succeed and masked exactly this failure on
    // Jul 21 (301 errors, "25 translated", all of them English copies).
    if (errors > 0 && modelLocalesDone === 0) {
      await sendTelegram(
        `🚨 <b>translate-pending</b>: all ${errors} model translation attempt(s) failed this run (${work.length} items pending) — provider chain down?`
      );
    }

    return NextResponse.json({
      success: true,
      pending_items: work.length,
      locales_translated: localesDone,
      model_locales_translated: modelLocalesDone,
      errors,
      elapsed_s: Math.round((Date.now() - startedAt) / 1000),
    });
  } catch (error) {
    console.error('[translate-pending] Fatal error:', error);
    await sendTelegram(
      `🚨 <b>translate-pending</b>: fatal error — ${String(error instanceof Error ? error.message : error).slice(0, 200)}`
    ).catch(() => {});
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
