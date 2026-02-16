import { inngest } from '../../client';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Social Sentinel — Agent 4
 *
 * Daily social media trend detection. Analyzes recent content_sources
 * from social platforms to identify trending topics in Dalat.
 * Runs 8 AM Vietnam (1 AM UTC).
 */
export const socialSentinel = inngest.createFunction(
  {
    id: 'seo-social-sentinel',
    name: 'SEO Social Sentinel',
    retries: 2,
  },
  { cron: '0 1 * * *' }, // 1 AM UTC = 8 AM Vietnam
  async ({ step }) => {
    const runId = await step.run('start-run', async () => {
      const supabase = getSupabase();
      const { data } = await supabase.rpc('start_agent_run', {
        p_agent_name: 'social-sentinel',
      });
      return data as string;
    });

    // Step 1: Gather recent social signals
    const signals = await step.run('gather-signals', async () => {
      const supabase = getSupabase();
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

      // Recent social content sources
      const { data: socialSources } = await supabase
        .from('content_sources')
        .select('raw_title, ai_summary, ai_tags, content_category, source_platform')
        .in('source_platform', ['facebook', 'instagram', 'tiktok'])
        .gte('created_at', threeDaysAgo)
        .limit(50);

      // Recent news sources
      const { data: newsSources } = await supabase
        .from('content_sources')
        .select('raw_title, ai_summary, ai_tags, content_category')
        .in('source_platform', ['vnexpress', 'tuoitre', 'thanhnien', 'google_news'])
        .gte('created_at', threeDaysAgo)
        .limit(30);

      // Recent events for correlation
      const { data: recentEvents } = await supabase
        .from('events')
        .select('title, ai_tags, starts_at')
        .eq('status', 'published')
        .gte('starts_at', new Date().toISOString())
        .limit(20);

      return {
        socialSources: socialSources || [],
        newsSources: newsSources || [],
        recentEvents: recentEvents || [],
      };
    });

    // Step 2: AI trend analysis
    const trends = await step.run('analyze-trends', async () => {
      const client = new Anthropic();

      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Analyze these Dalat social media and news signals to identify 3-5 trending topics.

SOCIAL MEDIA POSTS:
${signals.socialSources.map((s) => `[${s.source_platform}] ${s.raw_title || s.ai_summary}`).join('\n')}

NEWS ARTICLES:
${signals.newsSources.map((s) => `${s.raw_title || s.ai_summary}`).join('\n')}

UPCOMING EVENTS:
${signals.recentEvents.map((e) => `${e.title} (${e.starts_at?.split('T')[0]})`).join('\n')}

For each trend, return:
- topic_name: Clear name
- topic_slug: url-friendly slug
- topic_category: food/cafe/nature/nightlife/culture/weather/music/art/travel/business/festival/other
- mention_count: how many signals reference this
- engagement_score: 0-100 estimated engagement level
- trend_velocity: -1.0 to 1.0 (negative = declining, positive = growing)
- summary: 2-3 sentence description

Return ONLY valid JSON array:
[{"topic_name": "...", "topic_slug": "...", "topic_category": "...", "mention_count": 5, "engagement_score": 75, "trend_velocity": 0.8, "summary": "..."}]`,
        }],
      });

      const text = response.content.find((c) => c.type === 'text');
      if (!text || text.type !== 'text') throw new Error('No response');

      let json = text.text.trim();
      if (json.startsWith('```json')) json = json.slice(7);
      if (json.startsWith('```')) json = json.slice(3);
      if (json.endsWith('```')) json = json.slice(0, -3);

      return JSON.parse(json.trim()) as Array<{
        topic_name: string;
        topic_slug: string;
        topic_category: string;
        mention_count: number;
        engagement_score: number;
        trend_velocity: number;
        summary: string;
      }>;
    });

    // Step 3: Insert trending topics
    const inserted = await step.run('insert-trends', async () => {
      const supabase = getSupabase();
      const now = new Date();
      const windowStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      let count = 0;

      for (const trend of trends) {
        const { error } = await supabase
          .from('trending_topics')
          .insert({
            topic_name: trend.topic_name,
            topic_slug: trend.topic_slug,
            topic_category: trend.topic_category,
            mention_count: trend.mention_count,
            engagement_score: trend.engagement_score,
            trend_velocity: trend.trend_velocity,
            window_start: windowStart.toISOString(),
            window_end: now.toISOString(),
            ai_summary: trend.summary,
          });

        if (!error) count++;
      }

      return count;
    });

    await step.run('complete-run', async () => {
      const supabase = getSupabase();
      await supabase.rpc('complete_agent_run', {
        p_run_id: runId,
        p_status: 'completed',
        p_items_processed: signals.socialSources.length + signals.newsSources.length,
        p_items_created: inserted,
        p_api_calls_claude: 1,
        p_estimated_cost_usd: 0.002,
      });
    });

    return { success: true, trendsIdentified: trends.length, inserted };
  }
);
