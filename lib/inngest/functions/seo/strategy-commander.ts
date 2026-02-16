import { inngest } from '../../client';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const STRATEGY_PROMPT = `You are the content strategy commander for dalat.app, a community events platform for Đà Lạt, Vietnam.

Your job: analyze the current content inventory and generate 3-5 high-priority content items that should be written today.

Consider:
1. GAPS: What Dalat-related topics are we missing?
2. FRESHNESS: What existing content is stale and needs updates?
3. TIMELINESS: Are there upcoming events, seasons, or trends to cover?
4. KEYWORDS: What high-volume keywords don't have content yet?
5. BALANCE: Maintain a mix of news, guides, and evergreen content.

Content types you can assign:
- news: Timely articles from scraped sources (assign to content-forge)
- guide: Practical how-to content (assign to content-forge)
- event_preview: Upcoming event excitement (assign to content-forge)
- monthly_guide: "Dalat in [Month]" seasonal content (assign to content-forge)
- activity_guide: "Best [Activity] in Dalat" (assign to content-forge)
- trend_report: What's trending in Dalat right now (assign to content-forge)

Return ONLY valid JSON array:
[
  {
    "content_type": "news",
    "title": "Brief title describing the content to write",
    "brief": "2-3 sentence brief for the writer agent",
    "priority": 85,
    "target_keywords": ["keyword1", "keyword2"],
    "source_urls": ["urls of relevant scraped sources if any"]
  }
]`;

/**
 * Strategy Commander — Agent 1
 *
 * The brain. Runs first each morning (6 AM Vietnam = 11 PM UTC).
 * Queries content inventory, checks keyword gaps, reviews failures,
 * then generates 3-5 prioritized content items for other agents.
 */
export const strategyCommander = inngest.createFunction(
  {
    id: 'seo-strategy-commander',
    name: 'SEO Strategy Commander',
    retries: 2,
  },
  { cron: '0 23 * * *' }, // 11 PM UTC = 6 AM Vietnam
  async ({ step }) => {
    // Step 1: Start agent run
    const runId = await step.run('start-run', async () => {
      const supabase = getSupabase();
      const { data } = await supabase.rpc('start_agent_run', {
        p_agent_name: 'strategy-commander',
      });
      return data as string;
    });

    // Step 2: Gather current state
    const state = await step.run('gather-state', async () => {
      const supabase = getSupabase();

      // Content inventory by category
      const { data: categoryCounts } = await supabase
        .from('blog_posts')
        .select('content_type, status')
        .eq('status', 'published');

      const inventory: Record<string, number> = {};
      (categoryCounts || []).forEach((p) => {
        const key = p.content_type || 'blog';
        inventory[key] = (inventory[key] || 0) + 1;
      });

      // Recent content (last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentPosts } = await supabase
        .from('blog_posts')
        .select('title, content_type, published_at')
        .eq('status', 'published')
        .gte('published_at', weekAgo)
        .order('published_at', { ascending: false })
        .limit(20);

      // Uncovered keywords (high volume, no content)
      const { data: uncoveredKeywords } = await supabase
        .from('keyword_research')
        .select('keyword, search_volume_estimate, topic_cluster')
        .eq('content_exists', false)
        .order('search_volume_estimate', { ascending: false, nullsFirst: false })
        .limit(15);

      // Fresh scraped sources not yet used
      const { data: freshSources } = await supabase
        .from('content_sources')
        .select('id, source_url, raw_title, content_category, relevance_score')
        .eq('status', 'classified')
        .gte('relevance_score', 0.5)
        .order('relevance_score', { ascending: false })
        .limit(10);

      // Yesterday's agent failures
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: failures } = await supabase
        .from('agent_runs')
        .select('agent_name, errors_count, output')
        .eq('status', 'failed')
        .gte('started_at', yesterday);

      // Current queue (avoid duplicates)
      const { data: currentQueue } = await supabase
        .from('content_queue')
        .select('title, content_type, status')
        .in('status', ['pending', 'generating', 'draft', 'reviewing'])
        .limit(20);

      // Upcoming events (for event previews)
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: upcomingEvents } = await supabase
        .from('events')
        .select('title, starts_at, location_name, ai_tags')
        .eq('status', 'published')
        .gte('starts_at', new Date().toISOString())
        .lte('starts_at', nextWeek)
        .order('starts_at', { ascending: true })
        .limit(10);

      return {
        inventory,
        recentPosts: recentPosts || [],
        uncoveredKeywords: uncoveredKeywords || [],
        freshSources: freshSources || [],
        failures: failures || [],
        currentQueue: currentQueue || [],
        upcomingEvents: upcomingEvents || [],
        today: new Date().toISOString().split('T')[0],
        currentMonth: new Date().toLocaleString('en', { month: 'long' }),
      };
    });

    // Step 3: AI strategy generation
    const strategy = await step.run('generate-strategy', async () => {
      const client = new Anthropic();

      const stateContext = `
CURRENT DATE: ${state.today}
CURRENT MONTH: ${state.currentMonth}

CONTENT INVENTORY (published):
${JSON.stringify(state.inventory, null, 2)}

RECENT POSTS (last 7 days):
${state.recentPosts.map((p) => `- [${p.content_type}] ${p.title}`).join('\n') || 'None'}

UNCOVERED KEYWORDS:
${state.uncoveredKeywords.map((k) => `- "${k.keyword}" (vol: ${k.search_volume_estimate}, cluster: ${k.topic_cluster})`).join('\n') || 'None tracked yet'}

FRESH SCRAPED SOURCES (ready to rewrite):
${state.freshSources.map((s) => `- "${s.raw_title}" (${s.content_category}, relevance: ${s.relevance_score}) [${s.source_url}]`).join('\n') || 'None available'}

ALREADY IN QUEUE:
${state.currentQueue.map((q) => `- [${q.content_type}/${q.status}] ${q.title}`).join('\n') || 'Queue empty'}

UPCOMING EVENTS (this week):
${state.upcomingEvents.map((e) => `- ${e.title} (${e.starts_at?.split('T')[0]}) at ${e.location_name || 'TBD'}`).join('\n') || 'None'}

YESTERDAY'S FAILURES:
${state.failures.map((f) => `- ${f.agent_name}: ${f.errors_count} errors`).join('\n') || 'None'}
`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: STRATEGY_PROMPT,
        messages: [{ role: 'user', content: stateContext }],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      let jsonText = textContent.text.trim();
      if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
      if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
      if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);

      const items = JSON.parse(jsonText.trim());

      return {
        items: items as Array<{
          content_type: string;
          title: string;
          brief: string;
          priority: number;
          target_keywords: string[];
          source_urls: string[];
        }>,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    });

    // Step 4: Insert into content queue and trigger Content Forge
    const created = await step.run('create-queue-items', async () => {
      const supabase = getSupabase();
      let itemsCreated = 0;

      for (const item of strategy.items) {
        const { data: inserted, error } = await supabase
          .from('content_queue')
          .insert({
            content_type: item.content_type,
            title: item.title,
            brief: item.brief,
            source_urls: item.source_urls || [],
            priority: item.priority,
            target_keywords: item.target_keywords || [],
            assigned_agent: 'content-forge',
            status: 'pending',
          })
          .select('id')
          .single();

        if (!error && inserted) {
          // Trigger Content Forge for each item
          await inngest.send({
            name: 'seo/content-requested',
            data: { queueItemId: inserted.id },
          });
          itemsCreated++;
        }
      }

      return itemsCreated;
    });

    // Step 5: Complete agent run
    await step.run('complete-run', async () => {
      const supabase = getSupabase();
      const estimatedCost =
        (strategy.inputTokens / 1_000_000) * 3 +
        (strategy.outputTokens / 1_000_000) * 15;

      await supabase.rpc('complete_agent_run', {
        p_run_id: runId,
        p_status: 'completed',
        p_items_processed: strategy.items.length,
        p_items_created: created,
        p_api_calls_claude: 1,
        p_estimated_cost_usd: estimatedCost,
        p_output: {
          contentItems: strategy.items.map((i) => i.title),
          stateSnapshot: {
            inventorySize: Object.values(state.inventory).reduce((a, b) => a + b, 0),
            uncoveredKeywords: state.uncoveredKeywords.length,
            freshSources: state.freshSources.length,
          },
        },
      });
    });

    return {
      success: true,
      itemsCreated: created,
      strategy: strategy.items.map((i) => ({ type: i.content_type, title: i.title })),
    };
  }
);
