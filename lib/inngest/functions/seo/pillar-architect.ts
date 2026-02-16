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
 * Pillar Architect — Agent 6
 *
 * Weekly planner for evergreen pillar pages. Checks which pillar pages
 * need refresh, identifies new pillar opportunities from keyword data,
 * and queues content creation/refresh tasks.
 * Runs Sunday 9 AM Vietnam (2 AM UTC Sunday).
 */
export const pillarArchitect = inngest.createFunction(
  {
    id: 'seo-pillar-architect',
    name: 'SEO Pillar Architect',
    retries: 2,
  },
  { cron: '0 2 * * 0' }, // 2 AM UTC Sunday = 9 AM Vietnam Sunday
  async ({ step }) => {
    const runId = await step.run('start-run', async () => {
      const supabase = getSupabase();
      const { data } = await supabase.rpc('start_agent_run', {
        p_agent_name: 'pillar-architect',
      });
      return data as string;
    });

    // Step 1: Check existing pillar pages for refresh needs
    const pillarsToRefresh = await step.run('check-pillars', async () => {
      const supabase = getSupabase();

      const { data: pillars } = await supabase
        .from('pillar_pages')
        .select('id, slug, topic_cluster, target_keyword, last_refreshed_at, refresh_frequency_days, blog_post_id')
        .eq('needs_refresh', true);

      // Also check by date
      const { data: stalePillars } = await supabase
        .from('pillar_pages')
        .select('id, slug, topic_cluster, target_keyword, last_refreshed_at, refresh_frequency_days, blog_post_id')
        .eq('needs_refresh', false);

      const needsRefresh = [...(pillars || [])];

      for (const p of stalePillars || []) {
        if (!p.last_refreshed_at) {
          needsRefresh.push(p);
          continue;
        }
        const lastRefresh = new Date(p.last_refreshed_at);
        const daysSince = (Date.now() - lastRefresh.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince >= p.refresh_frequency_days) {
          needsRefresh.push(p);
        }
      }

      return needsRefresh;
    });

    // Step 2: Queue refresh tasks for stale pillars
    let refreshQueued = 0;
    if (pillarsToRefresh.length > 0) {
      refreshQueued = await step.run('queue-refreshes', async () => {
        const supabase = getSupabase();
        let count = 0;

        for (const pillar of pillarsToRefresh.slice(0, 3)) { // Max 3 refreshes per week
          const { data: inserted } = await supabase
            .from('content_queue')
            .insert({
              content_type: 'pillar',
              title: `Refresh: ${pillar.target_keyword}`,
              brief: `Update the evergreen pillar page for "${pillar.target_keyword}" (${pillar.topic_cluster} cluster). Check for new data, events, and venues to include. Keep existing high-ranking content but add fresh information.`,
              priority: 80,
              target_keywords: [pillar.target_keyword],
              assigned_agent: 'content-forge',
              status: 'pending',
              source_data: { pillarPageId: pillar.id, blogPostId: pillar.blog_post_id },
            })
            .select('id')
            .single();

          if (inserted) {
            await inngest.send({
              name: 'seo/content-requested',
              data: { queueItemId: inserted.id },
            });

            // Mark as refreshing
            await supabase
              .from('pillar_pages')
              .update({ needs_refresh: false, last_refreshed_at: new Date().toISOString() })
              .eq('id', pillar.id);

            count++;
          }
        }

        return count;
      });
    }

    // Step 3: Check for new pillar opportunities from keyword data
    const newPillarOpportunities = await step.run('find-opportunities', async () => {
      const supabase = getSupabase();

      // Find high-volume keyword clusters without pillar pages
      const { data: clusters } = await supabase
        .from('keyword_research')
        .select('topic_cluster, keyword, search_volume_estimate')
        .eq('content_exists', false)
        .order('search_volume_estimate', { ascending: false, nullsFirst: false })
        .limit(50);

      if (!clusters || clusters.length === 0) return [];

      // Group by cluster and sum volumes
      const clusterMap: Record<string, { keywords: string[]; totalVolume: number }> = {};
      for (const kw of clusters) {
        const cluster = kw.topic_cluster || 'uncategorized';
        if (!clusterMap[cluster]) clusterMap[cluster] = { keywords: [], totalVolume: 0 };
        clusterMap[cluster].keywords.push(kw.keyword);
        clusterMap[cluster].totalVolume += kw.search_volume_estimate || 0;
      }

      // Get existing pillar clusters
      const { data: existingPillars } = await supabase
        .from('pillar_pages')
        .select('topic_cluster');

      const existingClusters = new Set((existingPillars || []).map((p) => p.topic_cluster));

      // Return clusters that don't have pillar pages yet, sorted by total volume
      return Object.entries(clusterMap)
        .filter(([cluster]) => !existingClusters.has(cluster))
        .sort((a, b) => b[1].totalVolume - a[1].totalVolume)
        .slice(0, 3)
        .map(([cluster, data]) => ({
          cluster,
          keywords: data.keywords.slice(0, 5),
          totalVolume: data.totalVolume,
        }));
    });

    await step.run('complete-run', async () => {
      const supabase = getSupabase();
      await supabase.rpc('complete_agent_run', {
        p_run_id: runId,
        p_status: 'completed',
        p_items_processed: pillarsToRefresh.length + newPillarOpportunities.length,
        p_items_created: refreshQueued,
        p_api_calls_claude: 0,
        p_estimated_cost_usd: 0,
        p_output: {
          pillarsToRefresh: pillarsToRefresh.length,
          refreshQueued,
          newOpportunities: newPillarOpportunities,
        },
      });
    });

    return {
      success: true,
      pillarsRefreshed: refreshQueued,
      newOpportunities: newPillarOpportunities.length,
    };
  }
);
