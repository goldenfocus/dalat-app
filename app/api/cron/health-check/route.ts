import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { noStoreJson } from "@/lib/http/no-store-json";
import { sendTelegram } from "@/lib/alerts/telegram";
import {
  pauseStaleActivityGraphSeries,
  topUpSeriesOccurrences,
} from "@/lib/series/materialize";
import { logPipelineEvent } from "@/lib/news/pipeline-log";
import {
  buildVitalityFloorProblem,
  summarizeEventVitality,
  type EventVitalityRow,
} from "@/lib/events/vitality";
import {
  buildEventIndexingHealthProblem,
  summarizeEventIndexingHealth,
  type EventIndexingHealthSummary,
} from "@/lib/events/indexing-health";
import { getEventsIndexingReadiness } from "@/lib/translations-readiness";
import type { EventSeries } from "@/lib/types";

const NextResponse = { json: noStoreJson };

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

// The customer promise: the homepage must never look dead.
// Watches what visitors see, not the plumbing.
const MIN_DISTINCT_UPCOMING_14D = 8;

// A watched source with no run in this window is presumed dead.
const MAX_HEARTBEAT_AGE_H = 48;

// Legacy draft/review importers are retired. Activity Graph is the sole
// machine-discovery heartbeat for public activities.
const WATCHED_SOURCES = ["activity-graph"];

// Content promise: /news must never look dead either.
const MAX_NEWS_AGE_H = 26;

/**
 * Daily event-health watchdog + recurring-series top-up.
 * Runs at 02:30 UTC (09:30 Đà Lạt), between recurring scrape/process cycles.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[health-check] CRON_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const problems: string[] = [];

  // 1. Top up recurring series before evaluation so inventory is current.
  // The vitality check below still collapses all occurrences to one choice.
  let toppedUp = 0;
  let staleSeriesPaused = 0;
  const seriesNow = new Date();
  const { data: seriesList, error: seriesError } = await supabase
    .from("event_series")
    .select("*")
    .eq("status", "active");
  if (seriesError) {
    problems.push(`Series top-up query failed: ${seriesError.message}`);
  } else {
    for (const series of (seriesList ?? []) as EventSeries[]) {
      try {
        if (await pauseStaleActivityGraphSeries(supabase, series, seriesNow)) {
          staleSeriesPaused++;
          problems.push(
            `activity-graph series ${series.slug}: source confirmation is absent or older than 14 days; paused and future occurrences drafted`,
          );
          continue;
        }
        toppedUp += await topUpSeriesOccurrences(
          supabase,
          series,
          2,
          seriesNow,
        );
      } catch (error) {
        problems.push(
          `Series ${series.slug} freshness/top-up failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (toppedUp > 0) {
      console.log(`[health-check] Topped up ${toppedUp} series occurrences`);
    }
  }

  // 2. Customer promise: enough distinct visible choices? Materialized
  // recurring occurrences are useful inventory, but one weekly meetup still
  // gives a visitor only one kind of thing to choose.
  const vitalityStart = new Date().toISOString();
  const vitalityEnd = new Date(Date.now() + 14 * 86400_000).toISOString();
  const { data: upcomingRows, error: upcomingError } = await supabase
    .from("events")
    .select(
      "id, starts_at, series_id, organizer_id, source_platform, organizers(name)",
    )
    .eq("status", "published")
    .gt("starts_at", vitalityStart)
    .lt("starts_at", vitalityEnd)
    .order("starts_at", { ascending: true })
    .limit(1000);
  const eventVitality = summarizeEventVitality(
    (upcomingRows ?? []) as EventVitalityRow[],
  );
  if (upcomingError) {
    problems.push(
      `Upcoming event vitality query failed: ${upcomingError.message}`,
    );
  } else {
    const vitalityProblem = buildVitalityFloorProblem(
      eventVitality,
      MIN_DISTINCT_UPCOMING_14D,
    );
    if (vitalityProblem) problems.push(vitalityProblem);
  }

  // 3. Heartbeats: any watched import source silent too long?
  for (const source of WATCHED_SOURCES) {
    const { data } = await supabase
      .from("import_runs")
      .select("started_at")
      .eq("source", source)
      .order("started_at", { ascending: false })
      .limit(1);
    const last = data?.[0]?.started_at ? new Date(data[0].started_at) : null;
    if (!last || Date.now() - last.getTime() > MAX_HEARTBEAT_AGE_H * 3600_000) {
      problems.push(
        `${source}: no import run in ${MAX_HEARTBEAT_AGE_H}h (last: ${last?.toISOString() ?? "never"})`,
      );
    }
  }

  // 4. Content health: /news freshness, backlog, dead-cluster retry, pipeline errors.
  const content = await checkContentHealth(supabase, problems);

  // 5. Caption coverage: % of recent moments with settled AI metadata
  // (completed or privacy-skipped). A dead pipeline shows up here within
  // days instead of silently rotting like Inngest did (0 rows for months).
  const captionCoverage = await checkCaptionCoverage(supabase, problems);

  // 8. Search promise: every upcoming published event must have strong source
  // content and complete title/description translations in all 12 languages.
  // This detects a dead translation worker or a low-quality event within one
  // daily watchdog cycle instead of waiting for a ranking drop.
  const eventIndexingHealth = await checkEventIndexingHealth(supabase, problems);

  if (problems.length > 0) {
    await sendTelegram(
      `🚨 <b>dalat.app event health</b>\n${problems.map((p) => `• ${p}`).join("\n")}`,
    );
  }

  return NextResponse.json(
    {
      ok: problems.length === 0,
      upcoming: eventVitality.distinctChoices,
      upcomingOccurrences: eventVitality.occurrences,
      eventVitality,
      seriesToppedUp: toppedUp,
      staleSeriesPaused,
      problems,
      contentHealth: content,
      captionCoverage,
      eventIndexingHealth,
    },
    // Stale /news means the content pipeline has not produced verified fresh reporting.
    { status: content.newsStale ? 500 : 200 },
  );
}

async function checkEventIndexingHealth(
  supabase: SupabaseClient,
  problems: string[]
): Promise<EventIndexingHealthSummary> {
  const { data: upcoming, error, count } = await supabase
    .from("events")
    .select("id", { count: "exact" })
    .eq("status", "published")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1000);

  if (error) {
    problems.push(`event indexing: upcoming query failed: ${error.message}`);
    return { total: 0, allLocalesReady: 0, incomplete: 0, issues: [] };
  }

  const ids = (upcoming ?? []).map((event) => event.id);
  if ((count ?? ids.length) > ids.length) {
    problems.push(`event indexing: audit truncated at ${ids.length}/${count} upcoming events`);
  }

  try {
    const readiness = [];
    for (let index = 0; index < ids.length; index += 100) {
      const chunk = await getEventsIndexingReadiness(
        supabase,
        ids.slice(index, index + 100)
      );
      readiness.push(...chunk.values());
    }

    const summary = summarizeEventIndexingHealth(readiness);
    const problem = buildEventIndexingHealthProblem(summary);
    if (problem) problems.push(problem);
    return summary;
  } catch (readinessError) {
    const message = readinessError instanceof Error
      ? readinessError.message
      : String(readinessError);
    problems.push(`event indexing: readiness audit failed: ${message}`);
    return { total: ids.length, allLocalesReady: 0, incomplete: ids.length, issues: [] };
  }
}

// Caption pipeline promise: recent moments get AI metadata. Floor is the
// post-backfill high-water mark — do not lower it to silence an alert; fix
// the pipeline (/api/cron/process-moments) instead.
const MIN_CAPTION_COVERAGE_PCT = 80;

/**
 * % of last-30d eligible published moments whose moment_metadata is settled
 * ('completed', or 'skipped' by the privacy gate). Query errors THROW into
 * problems — a failed check must never read as healthy (aggregator-v1 lesson).
 */
async function checkCaptionCoverage(
  supabase: SupabaseClient,
  problems: string[],
): Promise<{ eligible: number; settled: number; pct: number | null }> {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: recent, error: recentError } = await supabase
    .from("moments")
    .select("id")
    .eq("status", "published")
    .in("content_type", ["photo", "image", "video", "audio", "pdf", "document"])
    .gte("created_at", since)
    .limit(1000);

  if (recentError) {
    problems.push(
      `caption coverage: moments query failed: ${recentError.message}`,
    );
    return { eligible: 0, settled: 0, pct: null };
  }

  const ids = (recent ?? []).map((m) => m.id);
  if (ids.length < 10) {
    // Too few recent moments to make a percentage meaningful.
    return { eligible: ids.length, settled: 0, pct: null };
  }

  // Chunked — 1000 UUIDs in one .in() blows past URL length limits.
  let settled = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data: settledRows, error: settledError } = await supabase
      .from("moment_metadata")
      .select("moment_id")
      .in("moment_id", ids.slice(i, i + 200))
      .in("processing_status", ["completed", "skipped"]);

    if (settledError) {
      problems.push(
        `caption coverage: metadata query failed: ${settledError.message}`,
      );
      return { eligible: ids.length, settled: 0, pct: null };
    }
    settled += settledRows?.length ?? 0;
  }
  const pct = Math.round((settled / ids.length) * 100);
  if (pct < MIN_CAPTION_COVERAGE_PCT) {
    problems.push(
      `caption coverage: ${pct}% of last-30d moments have AI metadata (${settled}/${ids.length}, floor ${MIN_CAPTION_COVERAGE_PCT}%) — is /api/cron/process-moments running?`,
    );
  }
  return { eligible: ids.length, settled, pct };
}

interface ContentHealth {
  newestNewsAgeHours: number | null;
  newsStale: boolean;
  // Kept in the response for compatibility; automatic promotion is disabled.
  promotedPostId: null;
  newsBacklog: number;
  newsReviewQueue: number;
  retriedArticles: number;
  pipelineErrors24h: number;
}

/**
 * News/blog pipeline watchdog:
 * - newest published news post must be < MAX_NEWS_AGE_H old; otherwise alert
 * - report pending/processing raw reporting as the work queue (zero is healthy)
 * - retry dead raw articles once
 * - surface content_pipeline_events error count for the last 24h
 */
async function checkContentHealth(
  supabase: SupabaseClient,
  problems: string[],
): Promise<ContentHealth> {
  const health: ContentHealth = {
    newestNewsAgeHours: null,
    newsStale: false,
    promotedPostId: null,
    newsBacklog: 0,
    newsReviewQueue: 0,
    retriedArticles: 0,
    pipelineErrors24h: 0,
  };

  const { data: newsCategory, error: categoryError } = await supabase
    .from("blog_categories")
    .select("id")
    .eq("slug", "news")
    .single();

  if (categoryError || !newsCategory) {
    problems.push(
      `content health: could not resolve news category: ${categoryError?.message ?? "no row"}`,
    );
  }

  if (newsCategory) {
    const newestNewsAgeHours = async (): Promise<number | null> => {
      const { data } = await supabase
        .from("blog_posts")
        .select("source_published_at, published_at")
        .eq("category_id", newsCategory.id)
        .eq("status", "published")
        .not("published_at", "is", null)
        .order("source_published_at", { ascending: false, nullsFirst: false })
        .limit(1);
      const newsDate = data?.[0]?.source_published_at ?? data?.[0]?.published_at;
      const ts = newsDate
        ? new Date(newsDate).getTime()
        : null;
      return ts === null ? null : (Date.now() - ts) / 3600_000;
    };

    health.newestNewsAgeHours = await newestNewsAgeHours();

    health.newsStale =
      health.newestNewsAgeHours === null ||
      health.newestNewsAgeHours > MAX_NEWS_AGE_H;
    if (health.newsStale) {
      problems.push(
        `Newest news post is ${
          health.newestNewsAgeHours === null
            ? "missing"
            : `${Math.round(health.newestNewsAgeHours)}h old`
        } (max ${MAX_NEWS_AGE_H}h) — fresh verified reporting required`,
      );
    }

    // Report actual pipeline work, not public "experimental" pages. A small or
    // empty queue is healthy; freshness and pipeline errors are the safeguards.
    const { count: backlogCount, error: backlogError } = await supabase
      .from("news_raw_articles")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "processing"]);
    health.newsBacklog = backlogCount ?? 0;
    if (backlogError) {
      problems.push(
        `content health: news work queue query failed: ${backlogError.message}`,
      );
    }

    const { count: reviewCount, error: reviewError } = await supabase
      .from("news_raw_articles")
      .select("*", { count: "exact", head: true })
      .eq("status", "review");
    health.newsReviewQueue = reviewCount ?? 0;
    if (reviewError) {
      problems.push(`content health: editorial review queue query failed: ${reviewError.message}`);
    } else if (health.newsReviewQueue > 0) {
      problems.push(`${health.newsReviewQueue} news candidate(s) await editorial review`);
    }
  }

  // Reset articles stuck in 'processing' — a crashed run leaves them behind
  // and they'd otherwise never be picked up again.
  const { data: stuckArticles, error: stuckError } = await supabase
    .from("news_raw_articles")
    .update({ status: "pending", cluster_id: null, processed_at: null })
    .eq("status", "processing")
    .lt("processed_at", new Date(Date.now() - 2 * 3600_000).toISOString())
    .select("id");
  if (stuckError) {
    problems.push(
      `content health: stuck-article sweep failed: ${stuckError.message}`,
    );
  } else if ((stuckArticles?.length ?? 0) > 0) {
    await logPipelineEvent(supabase, {
      stage: "health-check",
      level: "warn",
      message: `Reset ${stuckArticles!.length} articles stuck in 'processing' back to 'pending'`,
      meta: { count: stuckArticles!.length },
    });
  }

  // Retry dead raw articles ONCE (the '[retried]' prefix marks them).
  const { data: deadArticles, error: deadError } = await supabase
    .from("news_raw_articles")
    .select("id, error_message")
    .eq("status", "error")
    .limit(100);
  if (deadError) {
    problems.push(
      `content health: dead-article query failed: ${deadError.message}`,
    );
  }
  const toRetry = (deadArticles ?? []).filter((article) => {
    const message = article.error_message ?? "";
    // A legacy-recovery claim is a private reservation, not scraped input.
    // Only news-scrape may reclaim it after its 15-minute lease expires;
    // promoting the placeholder row here would feed invented input to the
    // processor after a crash between reservation and source fetch.
    return (
      !message.startsWith("[retried]") &&
      !message.startsWith("[legacy-recovery:claim:")
    );
  });
  for (const article of toRetry) {
    let retryQuery = supabase
      .from("news_raw_articles")
      .update({
        status: "pending",
        error_message: `[retried] ${article.error_message ?? ""}`,
      })
      .eq("id", article.id)
      .eq("status", "error");
    retryQuery = article.error_message
      ? retryQuery.eq("error_message", article.error_message)
      : retryQuery.is("error_message", null);
    const { data: retriedRows, error: retryError } =
      await retryQuery.select("id");
    if (!retryError && retriedRows?.length === 1) health.retriedArticles++;
  }

  // Pipeline errors in the last 24h.
  const { count: errorCount, error: errorCountError } = await supabase
    .from("content_pipeline_events")
    .select("*", { count: "exact", head: true })
    .eq("level", "error")
    .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  if (errorCountError) {
    problems.push(
      `content health: pipeline error-count query failed: ${errorCountError.message}`,
    );
  }
  health.pipelineErrors24h = errorCount ?? 0;
  if (health.pipelineErrors24h > 5) {
    problems.push(
      `content health: ${health.pipelineErrors24h} pipeline errors in the last 24h`,
    );
  }

  return health;
}
