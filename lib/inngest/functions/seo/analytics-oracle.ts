import { inngest } from '../../client';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Analytics Oracle — Agent 13
 *
 * Weekly performance tracking. Summarizes agent costs, content output,
 * keyword coverage, and content health metrics.
 * Runs Monday noon Vietnam (5 AM UTC Monday).
 */
export const analyticsOracle = inngest.createFunction(
  {
    id: 'seo-analytics-oracle',
    name: 'SEO Analytics Oracle',
    retries: 2,
  },
  { cron: '0 5 * * 1' }, // 5 AM UTC Monday = noon Vietnam Monday
  async ({ step }) => {
    const runId = await step.run('start-run', async () => {
      const supabase = getSupabase();
      const { data } = await supabase.rpc('start_agent_run', {
        p_agent_name: 'analytics-oracle',
      });
      return data as string;
    });

    const report = await step.run('generate-report', async () => {
      const supabase = getSupabase();
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Agent run statistics for the week
      const { data: runs } = await supabase
        .from('agent_runs')
        .select('agent_name, status, duration_ms, items_created, estimated_cost_usd, errors_count')
        .gte('started_at', weekAgo);

      const agentStats: Record<string, {
        runs: number;
        successes: number;
        failures: number;
        totalCost: number;
        totalItems: number;
        totalErrors: number;
      }> = {};

      for (const run of runs || []) {
        if (!agentStats[run.agent_name]) {
          agentStats[run.agent_name] = { runs: 0, successes: 0, failures: 0, totalCost: 0, totalItems: 0, totalErrors: 0 };
        }
        const stats = agentStats[run.agent_name];
        stats.runs++;
        if (run.status === 'completed') stats.successes++;
        if (run.status === 'failed') stats.failures++;
        stats.totalCost += Number(run.estimated_cost_usd) || 0;
        stats.totalItems += run.items_created || 0;
        stats.totalErrors += run.errors_count || 0;
      }

      // Content pipeline stats
      const { data: queueStats } = await supabase
        .from('content_queue')
        .select('status')
        .gte('created_at', weekAgo);

      const queueByStatus: Record<string, number> = {};
      for (const item of queueStats || []) {
        queueByStatus[item.status] = (queueByStatus[item.status] || 0) + 1;
      }

      // Published content count (total and this week)
      const { count: totalPublished } = await supabase
        .from('blog_posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published');

      const { count: weekPublished } = await supabase
        .from('blog_posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .gte('published_at', weekAgo);

      // Keyword coverage
      const { count: totalKeywords } = await supabase
        .from('keyword_research')
        .select('*', { count: 'exact', head: true });

      const { count: coveredKeywords } = await supabase
        .from('keyword_research')
        .select('*', { count: 'exact', head: true })
        .eq('content_exists', true);

      // Content sources stats
      const { count: sourcesThisWeek } = await supabase
        .from('content_sources')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo);

      // Total cost this week
      const totalWeeklyCost = Object.values(agentStats).reduce(
        (sum, s) => sum + s.totalCost, 0
      );

      return {
        period: { start: weekAgo, end: new Date().toISOString() },
        agentStats,
        pipeline: queueByStatus,
        content: {
          totalPublished: totalPublished || 0,
          publishedThisWeek: weekPublished || 0,
        },
        keywords: {
          total: totalKeywords || 0,
          covered: coveredKeywords || 0,
          coveragePercent: totalKeywords
            ? Math.round(((coveredKeywords || 0) / totalKeywords) * 100)
            : 0,
        },
        sources: {
          scrapedThisWeek: sourcesThisWeek || 0,
        },
        costs: {
          totalWeekly: Math.round(totalWeeklyCost * 100) / 100,
          projectedMonthly: Math.round(totalWeeklyCost * 4.33 * 100) / 100,
        },
      };
    });

    await step.run('complete-run', async () => {
      const supabase = getSupabase();
      await supabase.rpc('complete_agent_run', {
        p_run_id: runId,
        p_status: 'completed',
        p_items_processed: 1,
        p_estimated_cost_usd: 0,
        p_output: report,
      });
    });

    return { success: true, report };
  }
);
