import { Link } from "@/lib/i18n/routing";
import {
  ArrowLeft,
  Bot,
  FileText,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Search,
  Globe,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

async function getProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data;
}

async function getSEODashboardData() {
  const supabase = await createClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    queueResult,
    agentRunsResult,
    publishedResult,
    keywordsResult,
    trendingResult,
    sourcesResult,
  ] = await Promise.all([
    // Content pipeline overview
    supabase
      .from("content_queue")
      .select("status", { count: "exact" })
      .order("created_at", { ascending: false }),
    // Agent runs (last 7 days)
    supabase
      .from("agent_runs")
      .select("*")
      .gte("started_at", sevenDaysAgo)
      .order("started_at", { ascending: false })
      .limit(50),
    // Recently auto-published
    supabase
      .from("blog_posts")
      .select("id, title, slug, published_at, source, content_type, blog_categories(slug)")
      .eq("status", "published")
      .eq("auto_generated", true)
      .order("published_at", { ascending: false })
      .limit(10),
    // Keyword coverage
    supabase
      .from("keyword_research")
      .select("keyword, search_volume_estimate, current_rank, content_exists, topic_cluster"),
    // Trending topics
    supabase
      .from("trending_topics")
      .select("*")
      .order("engagement_score", { ascending: false })
      .limit(5),
    // Content sources (last 7 days)
    supabase
      .from("content_sources")
      .select("source_platform, status")
      .gte("created_at", sevenDaysAgo),
  ]);

  // Aggregate queue stats
  const queueItems = queueResult.data ?? [];
  const queueByStatus: Record<string, number> = {};
  for (const item of queueItems) {
    queueByStatus[item.status] = (queueByStatus[item.status] || 0) + 1;
  }

  // Aggregate agent stats
  const agentRuns = agentRunsResult.data ?? [];
  const agentStats: Record<string, { runs: number; successes: number; cost: number }> = {};
  for (const run of agentRuns) {
    if (!agentStats[run.agent_name]) {
      agentStats[run.agent_name] = { runs: 0, successes: 0, cost: 0 };
    }
    agentStats[run.agent_name].runs++;
    if (run.status === "completed") agentStats[run.agent_name].successes++;
    agentStats[run.agent_name].cost += run.estimated_cost_usd || 0;
  }

  // Keyword stats
  const keywords = keywordsResult.data ?? [];
  const totalKeywords = keywords.length;
  const coveredKeywords = keywords.filter((k) => k.content_exists).length;
  const topTenKeywords = keywords.filter(
    (k) => k.current_rank && k.current_rank <= 10
  ).length;

  // Source stats
  const sources = sourcesResult.data ?? [];
  const sourcesByPlatform: Record<string, number> = {};
  for (const s of sources) {
    sourcesByPlatform[s.source_platform] = (sourcesByPlatform[s.source_platform] || 0) + 1;
  }

  // Total weekly cost
  const totalWeeklyCost = agentRuns.reduce(
    (sum, r) => sum + (r.estimated_cost_usd || 0),
    0
  );

  return {
    queueByStatus,
    agentStats,
    totalWeeklyCost,
    publishedPosts: publishedResult.data ?? [],
    keywordStats: { totalKeywords, coveredKeywords, topTenKeywords },
    trending: trendingResult.data ?? [],
    sourcesByPlatform,
  };
}

export default async function AdminSEOPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const profile = await getProfile(user.id);
  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
    redirect("/");
  }

  const data = await getSEODashboardData();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link
            href="/admin"
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold">SEO Command Center</h1>
        </div>
        <p className="text-muted-foreground">
          Content pipeline, agent health, keyword coverage, and costs
        </p>
      </div>

      {/* Top-level stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <StatCard
          icon={<FileText className="w-5 h-5" />}
          label="Pipeline Items"
          value={Object.values(data.queueByStatus).reduce((s, v) => s + v, 0)}
          detail={`${data.queueByStatus.published || 0} published`}
        />
        <StatCard
          icon={<Bot className="w-5 h-5" />}
          label="Agent Runs (7d)"
          value={Object.values(data.agentStats).reduce(
            (s, v) => s + v.runs,
            0
          )}
          detail={`${Object.values(data.agentStats).reduce(
            (s, v) => s + v.successes,
            0
          )} succeeded`}
        />
        <StatCard
          icon={<Search className="w-5 h-5" />}
          label="Keywords Tracked"
          value={data.keywordStats.totalKeywords}
          detail={`${data.keywordStats.coveredKeywords} covered, ${data.keywordStats.topTenKeywords} in top 10`}
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Weekly AI Cost"
          value={`$${data.totalWeeklyCost.toFixed(2)}`}
          detail={`~$${(data.totalWeeklyCost * 4.3).toFixed(0)}/mo projected`}
        />
      </div>

      {/* Content Pipeline */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Content Pipeline</h2>
        <div className="grid gap-3 grid-cols-3 md:grid-cols-6">
          {(
            ["pending", "generating", "draft", "reviewing", "approved", "published", "rejected"] as const
          ).map((status) => (
            <div
              key={status}
              className="p-3 rounded-lg border bg-card text-center"
            >
              <div className="text-2xl font-bold">
                {data.queueByStatus[status] || 0}
              </div>
              <div className="text-xs text-muted-foreground capitalize">
                {status}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Agent Health */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Agent Health (7 days)</h2>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(data.agentStats)
            .sort(([, a], [, b]) => b.runs - a.runs)
            .map(([name, stats]) => {
              const successRate =
                stats.runs > 0
                  ? Math.round((stats.successes / stats.runs) * 100)
                  : 0;
              return (
                <div
                  key={name}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                >
                  {successRate >= 80 ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  ) : successRate >= 50 ? (
                    <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{name}</div>
                    <div className="text-xs text-muted-foreground">
                      {stats.runs} runs · {successRate}% success · $
                      {stats.cost.toFixed(3)}
                    </div>
                  </div>
                </div>
              );
            })}
          {Object.keys(data.agentStats).length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full py-4 text-center">
              No agent runs in the last 7 days
            </p>
          )}
        </div>
      </section>

      {/* Sources Ingested */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Sources Ingested (7 days)</h2>
        <div className="flex flex-wrap gap-3">
          {Object.entries(data.sourcesByPlatform).map(([platform, count]) => (
            <div
              key={platform}
              className="px-4 py-2 rounded-lg border bg-card flex items-center gap-2"
            >
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">{platform}</span>
              <span className="text-xs text-muted-foreground">{count} articles</span>
            </div>
          ))}
          {Object.keys(data.sourcesByPlatform).length === 0 && (
            <p className="text-sm text-muted-foreground">No sources ingested yet</p>
          )}
        </div>
      </section>

      {/* Trending Topics */}
      {data.trending.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Trending Topics</h2>
          <div className="space-y-2">
            {data.trending.map((topic) => (
              <div
                key={topic.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card"
              >
                <TrendingUp className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm">{topic.topic_name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {topic.topic_category} · {topic.mention_count} mentions
                  </span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">
                  score: {topic.engagement_score}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Auto-Published */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Recent Auto-Published</h2>
        <div className="space-y-2">
          {data.publishedPosts.map((post) => {
            const cats = post.blog_categories;
            const category = (Array.isArray(cats) ? cats[0] : cats) as { slug: string } | null;
            return (
              <div
                key={post.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card"
              >
                <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/blog/${category?.slug ?? "news"}/${post.slug}`}
                    className="font-medium text-sm hover:text-primary transition-colors truncate block"
                  >
                    {post.title}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {post.source} · {post.content_type} ·{" "}
                    {post.published_at
                      ? new Date(post.published_at).toLocaleDateString("vi-VN")
                      : "—"}
                  </div>
                </div>
              </div>
            );
          })}
          {data.publishedPosts.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No auto-published articles yet
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {detail && (
        <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
      )}
    </div>
  );
}
