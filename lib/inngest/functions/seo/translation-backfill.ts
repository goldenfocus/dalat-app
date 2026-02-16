import { inngest } from '../../client';
import { createClient } from '@supabase/supabase-js';
import { triggerTranslationServer } from '@/lib/translations';
import type { TranslationFieldName } from '@/lib/types';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const LOCALES = ['en', 'vi', 'ko', 'zh', 'ru', 'fr', 'ja', 'ms', 'th', 'de', 'es', 'id'] as const;

/**
 * Translation Backfill — Agent 9
 *
 * Daily scan for content missing translations in any of the 12 locales.
 * Triggers translation jobs for any gaps found.
 * Runs 11 AM Vietnam (4 AM UTC).
 */
export const translationBackfill = inngest.createFunction(
  {
    id: 'seo-translation-backfill',
    name: 'SEO Translation Backfill',
    retries: 2,
  },
  { cron: '0 4 * * *' }, // 4 AM UTC = 11 AM Vietnam
  async ({ step }) => {
    const runId = await step.run('start-run', async () => {
      const supabase = getSupabase();
      const { data } = await supabase.rpc('start_agent_run', {
        p_agent_name: 'translation-backfill',
      });
      return data as string;
    });

    // Step 1: Find published blog posts with incomplete translations
    const blogGaps = await step.run('find-blog-gaps', async () => {
      const supabase = getSupabase();

      const { data: posts } = await supabase
        .from('blog_posts')
        .select('id, title, story_content, technical_content, meta_description')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(50);

      const gaps: Array<{
        postId: string;
        missingFields: Array<{ field_name: TranslationFieldName; text: string }>;
      }> = [];

      for (const post of posts || []) {
        // Check what translations exist
        const { data: existing } = await supabase
          .from('content_translations')
          .select('field_name, target_locale')
          .eq('content_type', 'blog')
          .eq('content_id', post.id);

        const existingSet = new Set(
          (existing || []).map((t) => `${t.field_name}:${t.target_locale}`)
        );

        const requiredFields: Array<{ field_name: TranslationFieldName; text: string }> = [
          { field_name: 'title', text: post.title },
          { field_name: 'story_content', text: post.story_content },
        ];

        if (post.meta_description) {
          requiredFields.push({ field_name: 'meta_description', text: post.meta_description });
        }

        const missingFields: Array<{ field_name: TranslationFieldName; text: string }> = [];

        for (const field of requiredFields) {
          // Check if any locale is missing for this field
          const hasMissing = LOCALES.some(
            (locale) => !existingSet.has(`${field.field_name}:${locale}`)
          );
          if (hasMissing) {
            missingFields.push(field);
          }
        }

        if (missingFields.length > 0) {
          gaps.push({ postId: post.id, missingFields });
        }
      }

      return gaps;
    });

    // Step 2: Find events with incomplete translations
    const eventGaps = await step.run('find-event-gaps', async () => {
      const supabase = getSupabase();

      const { data: events } = await supabase
        .from('events')
        .select('id, title, description')
        .eq('status', 'published')
        .gte('starts_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .limit(30);

      const gaps: Array<{
        eventId: string;
        missingFields: Array<{ field_name: TranslationFieldName; text: string }>;
      }> = [];

      for (const event of events || []) {
        const { data: existing } = await supabase
          .from('content_translations')
          .select('field_name, target_locale')
          .eq('content_type', 'event')
          .eq('content_id', event.id);

        const existingSet = new Set(
          (existing || []).map((t) => `${t.field_name}:${t.target_locale}`)
        );

        const missingFields: Array<{ field_name: TranslationFieldName; text: string }> = [];

        if (event.title) {
          const hasMissing = LOCALES.some(
            (locale) => !existingSet.has(`title:${locale}`)
          );
          if (hasMissing) missingFields.push({ field_name: 'title', text: event.title });
        }

        if (event.description) {
          const hasMissing = LOCALES.some(
            (locale) => !existingSet.has(`description:${locale}`)
          );
          if (hasMissing) missingFields.push({ field_name: 'description', text: event.description });
        }

        if (missingFields.length > 0) {
          gaps.push({ eventId: event.id, missingFields });
        }
      }

      return gaps;
    });

    // Step 3: Trigger translations for gaps (rate-limited to avoid API overload)
    const triggered = await step.run('trigger-translations', async () => {
      let blogTriggered = 0;
      let eventTriggered = 0;

      // Blog translations (max 10 per run)
      for (const gap of blogGaps.slice(0, 10)) {
        await triggerTranslationServer(
          'blog',
          gap.postId,
          gap.missingFields as Array<{ field_name: TranslationFieldName; text: string }>
        );
        blogTriggered++;
      }

      // Event translations (max 10 per run)
      for (const gap of eventGaps.slice(0, 10)) {
        await triggerTranslationServer(
          'event',
          gap.eventId,
          gap.missingFields as Array<{ field_name: TranslationFieldName; text: string }>
        );
        eventTriggered++;
      }

      return { blogTriggered, eventTriggered };
    });

    await step.run('complete-run', async () => {
      const supabase = getSupabase();
      // Translation cost is roughly $0.015 per 1000 chars via Google Translate
      const estimatedCost = (triggered.blogTriggered + triggered.eventTriggered) * 0.02;

      await supabase.rpc('complete_agent_run', {
        p_run_id: runId,
        p_status: 'completed',
        p_items_processed: blogGaps.length + eventGaps.length,
        p_items_created: triggered.blogTriggered + triggered.eventTriggered,
        p_api_calls_google_translate: (triggered.blogTriggered + triggered.eventTriggered) * 12,
        p_estimated_cost_usd: estimatedCost,
        p_output: {
          blogGaps: blogGaps.length,
          eventGaps: eventGaps.length,
          triggered,
        },
      });
    });

    return {
      success: true,
      blogGapsFound: blogGaps.length,
      eventGapsFound: eventGaps.length,
      ...triggered,
    };
  }
);
