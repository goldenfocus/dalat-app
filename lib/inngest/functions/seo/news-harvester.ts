import { inngest } from '../../client';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import type { NewsArticle } from '@/lib/import/processors/news-base';
import { scrapeVnExpress } from '@/lib/import/processors/vnexpress';
import { scrapeGoogleNews } from '@/lib/import/processors/google-news';
import { scrapeLamdongGov } from '@/lib/import/processors/lamdong-gov';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * News Harvester — Agent 3
 *
 * The eyes. Runs daily at 5 AM Vietnam time (10 PM UTC previous day).
 * Scrapes Vietnamese news sources, deduplicates, classifies relevance,
 * and inserts into content_sources.
 */
export const newsHarvester = inngest.createFunction(
  {
    id: 'seo-news-harvester',
    name: 'SEO News Harvester',
    retries: 2,
  },
  { cron: '0 22 * * *' }, // 10 PM UTC = 5 AM Vietnam
  async ({ step }) => {
    // Step 1: Start agent run
    const runId = await step.run('start-run', async () => {
      const supabase = getSupabase();
      const { data } = await supabase.rpc('start_agent_run', {
        p_agent_name: 'news-harvester',
      });
      return data as string;
    });

    // Step 2: Scrape all sources
    const vnexpressArticles = await step.run('scrape-vnexpress', async () => {
      return await scrapeVnExpress();
    });

    const googleNewsArticles = await step.run('scrape-google-news', async () => {
      return await scrapeGoogleNews();
    });

    const lamdongGovArticles = await step.run('scrape-lamdong-gov', async () => {
      return await scrapeLamdongGov();
    });

    const allArticles = [...vnexpressArticles, ...googleNewsArticles, ...lamdongGovArticles];

    // Step 3: Deduplicate and insert into content_sources
    const insertResult = await step.run('deduplicate-and-insert', async () => {
      const supabase = getSupabase();
      let inserted = 0;
      let duplicates = 0;

      for (const article of allArticles) {
        // URL-based dedup: try insert, catch unique constraint violation
        const { error } = await supabase
          .from('content_sources')
          .insert({
            source_platform: article.sourcePlatform,
            source_url: article.url,
            raw_title: article.title,
            raw_content: article.content || null,
            raw_images: article.images,
            raw_publish_date: article.publishDate
              ? new Date(article.publishDate).toISOString()
              : null,
            status: 'raw',
          });

        if (error?.code === '23505') {
          // Duplicate URL — skip
          duplicates++;
        } else if (!error) {
          inserted++;
        }
      }

      return { inserted, duplicates, total: allArticles.length };
    });

    // Step 4: Classify new articles with Claude Haiku
    const classifyResult = await step.run('classify-articles', async () => {
      const supabase = getSupabase();

      // Get unclassified articles
      const { data: rawArticles } = await supabase
        .from('content_sources')
        .select('id, raw_title, raw_content, source_platform')
        .eq('status', 'raw')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!rawArticles || rawArticles.length === 0) {
        return { classified: 0, apiCalls: 0 };
      }

      const client = new Anthropic();
      let classified = 0;
      let apiCalls = 0;

      // Batch classify (5 at a time to minimize API calls)
      for (let i = 0; i < rawArticles.length; i += 5) {
        const batch = rawArticles.slice(i, i + 5);

        const prompt = `Classify these Vietnamese news articles for relevance to Đà Lạt (Dalat) tourism and events.

For each article, return:
- relevance_score: 0.0-1.0 (how relevant to Dalat tourism, events, culture, food, nightlife, travel)
- content_category: one of (news, event, social, travel, business, weather, government)
- summary: 1-2 sentence English summary
- tags: array of relevant tags

ARTICLES:
${batch.map((a, idx) => `[${idx}] Title: ${a.raw_title}\nContent: ${(a.raw_content || '').slice(0, 500)}\nSource: ${a.source_platform}`).join('\n\n')}

Return ONLY valid JSON array:
[{"index": 0, "relevance_score": 0.8, "content_category": "news", "summary": "...", "tags": ["dalat", "tourism"]}]`;

        const response = await client.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        });
        apiCalls++;

        const textContent = response.content.find((c) => c.type === 'text');
        if (!textContent || textContent.type !== 'text') continue;

        let jsonText = textContent.text.trim();
        if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
        if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
        if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);

        try {
          const results = JSON.parse(jsonText.trim()) as Array<{
            index: number;
            relevance_score: number;
            content_category: string;
            summary: string;
            tags: string[];
          }>;

          for (const result of results) {
            const article = batch[result.index];
            if (!article) continue;

            await supabase
              .from('content_sources')
              .update({
                relevance_score: result.relevance_score,
                content_category: result.content_category,
                ai_summary: result.summary,
                ai_tags: result.tags,
                status: 'classified',
              })
              .eq('id', article.id);

            classified++;
          }
        } catch {
          // JSON parse failed for this batch — skip
        }
      }

      return { classified, apiCalls };
    });

    // Step 5: Complete agent run
    await step.run('complete-run', async () => {
      const supabase = getSupabase();
      // Haiku cost: ~$0.25/M input, ~$1.25/M output
      const estimatedCost = classifyResult.apiCalls * 0.002; // rough estimate per call

      await supabase.rpc('complete_agent_run', {
        p_run_id: runId,
        p_status: 'completed',
        p_items_processed: insertResult.total,
        p_items_created: insertResult.inserted,
        p_items_skipped: insertResult.duplicates,
        p_api_calls_claude: classifyResult.apiCalls,
        p_estimated_cost_usd: estimatedCost,
        p_output: {
          sources: {
            vnexpress: vnexpressArticles.length,
            googleNews: googleNewsArticles.length,
            lamdongGov: lamdongGovArticles.length,
          },
          insertResult,
          classifyResult,
        },
      });
    });

    return {
      success: true,
      scraped: allArticles.length,
      inserted: insertResult.inserted,
      duplicates: insertResult.duplicates,
      classified: classifyResult.classified,
    };
  }
);
