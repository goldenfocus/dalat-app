import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendTelegram } from "@/lib/alerts/telegram";
import { materializeSeriesOccurrences } from "@/lib/series/materialize";
import { logPipelineEvent } from "@/lib/news/pipeline-log";
import type { EventSeries } from "@/lib/types";

export const maxDuration = 60;

// The customer promise: the homepage must never look dead.
// Watches what visitors see, not the plumbing.
const MIN_UPCOMING_14D = 8;

// A watched source with no run in this window is presumed dead.
const MAX_HEARTBEAT_AGE_H = 48;

// Add "facebook" once the Apify schedule is re-enabled (it webhooks daily).
const WATCHED_SOURCES = ["dalat-gov"];

// Content promise: /news must never look dead either.
const MAX_NEWS_AGE_H = 26;
const MIN_NEWS_BACKLOG = 7;

/**
 * Daily event-health watchdog + recurring-series top-up.
 * Runs at 02:30 UTC (09:30 Đà Lạt), after both scrape crons.
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
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const problems: string[] = [];

  // 1. Top up recurring series BEFORE counting — the floor should count.
  let toppedUp = 0;
  const { data: seriesList, error: seriesError } = await supabase
    .from("event_series")
    .select("*")
    .eq("status", "active");
  if (seriesError) {
    problems.push(`Series top-up query failed: ${seriesError.message}`);
  } else {
    for (const series of (seriesList ?? []) as EventSeries[]) {
      toppedUp += await materializeSeriesOccurrences(supabase, series, 2);
    }
    if (toppedUp > 0) {
      console.log(`[health-check] Topped up ${toppedUp} series occurrences`);
    }
  }

  // 2. Customer promise: enough visible upcoming events?
  const { count: upcoming } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("status", "published")
    .gt("starts_at", new Date().toISOString())
    .lt("starts_at", new Date(Date.now() + 14 * 86400_000).toISOString());
  if ((upcoming ?? 0) < MIN_UPCOMING_14D) {
    problems.push(
      `Only ${upcoming ?? 0} published events in the next 14 days (floor: ${MIN_UPCOMING_14D})`
    );
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
        `${source}: no import run in ${MAX_HEARTBEAT_AGE_H}h (last: ${last?.toISOString() ?? "never"})`
      );
    }
  }

  // 4. Content health: /news freshness, backlog, dead-cluster retry, pipeline errors.
  const content = await checkContentHealth(supabase, problems);

  if (problems.length > 0) {
    await sendTelegram(
      `🚨 <b>dalat.app event health</b>\n${problems.map((p) => `• ${p}`).join("\n")}`
    );
  }

  return NextResponse.json(
    {
      ok: problems.length === 0,
      upcoming: upcoming ?? 0,
      seriesToppedUp: toppedUp,
      problems,
      contentHealth: content,
    },
    // Stale /news even after a promotion attempt = cron run failed.
    { status: content.newsStale ? 500 : 200 }
  );
}

interface ContentHealth {
  newestNewsAgeHours: number | null;
  newsStale: boolean;
  promotedPostId: string | null;
  newsBacklog: number;
  retriedArticles: number;
  pipelineErrors24h: number;
}

/**
 * News/blog pipeline watchdog:
 * - newest published news post must be < MAX_NEWS_AGE_H old; if not, promote
 *   the best experimental backlog candidate
 * - backlog (experimental news posts) should stay above MIN_NEWS_BACKLOG
 * - retry dead raw articles once
 * - surface content_pipeline_events error count for the last 24h
 */
async function checkContentHealth(
  supabase: SupabaseClient,
  problems: string[]
): Promise<ContentHealth> {
  const health: ContentHealth = {
    newestNewsAgeHours: null,
    newsStale: false,
    promotedPostId: null,
    newsBacklog: 0,
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
      `content health: could not resolve news category: ${categoryError?.message ?? "no row"}`
    );
  }

  if (newsCategory) {
    const newestNewsAgeHours = async (): Promise<number | null> => {
      const { data } = await supabase
        .from("blog_posts")
        .select("published_at")
        .eq("category_id", newsCategory.id)
        .eq("status", "published")
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(1);
      const ts = data?.[0]?.published_at
        ? new Date(data[0].published_at).getTime()
        : null;
      return ts === null ? null : (Date.now() - ts) / 3600_000;
    };

    health.newestNewsAgeHours = await newestNewsAgeHours();

    if (
      health.newestNewsAgeHours === null ||
      health.newestNewsAgeHours > MAX_NEWS_AGE_H
    ) {
      // Promote the best backlog candidate to keep /news alive.
      const { data: candidates } = await supabase
        .from("blog_posts")
        .select("id, title, quality_score")
        .eq("category_id", newsCategory.id)
        .eq("status", "experimental")
        .not("published_at", "is", null)
        .order("quality_score", { ascending: false })
        .limit(1);
      const candidate = candidates?.[0];
      let promotionFailed = false;

      if (candidate) {
        // Bump published_at so the promoted post reads as fresh and actually
        // clears the staleness check (its backlog date may be weeks old).
        const { error: promoteError } = await supabase
          .from("blog_posts")
          .update({ status: "published", published_at: new Date().toISOString() })
          .eq("id", candidate.id);

        if (!promoteError) {
          health.promotedPostId = candidate.id;
          await logPipelineEvent(supabase, {
            stage: "health-check",
            postId: candidate.id,
            level: "warn",
            message: `Promoted backlog post to published: ${candidate.title}`,
            meta: { qualityScore: candidate.quality_score },
          });
          health.newestNewsAgeHours = await newestNewsAgeHours();
        } else {
          promotionFailed = true;
          await logPipelineEvent(supabase, {
            stage: "health-check",
            postId: candidate.id,
            level: "error",
            message: `Promotion failed: ${promoteError.message}`,
          });
        }
      }

      health.newsStale =
        health.newestNewsAgeHours === null ||
        health.newestNewsAgeHours > MAX_NEWS_AGE_H;
      if (health.newsStale) {
        problems.push(
          `Newest news post is ${
            health.newestNewsAgeHours === null
              ? "missing"
              : `${Math.round(health.newestNewsAgeHours)}h old`
          } (max ${MAX_NEWS_AGE_H}h) — promotion ${
            health.promotedPostId
              ? "did not help"
              : promotionFailed
                ? "attempted but failed"
                : "found no candidate"
          }`
        );
      }
    }

    // Backlog: enough experimental news posts queued up?
    const { count: backlogCount } = await supabase
      .from("blog_posts")
      .select("*", { count: "exact", head: true })
      .eq("category_id", newsCategory.id)
      .eq("status", "experimental");
    health.newsBacklog = backlogCount ?? 0;

    if (health.newsBacklog < MIN_NEWS_BACKLOG) {
      problems.push(
        `content health: news backlog ${health.newsBacklog} below floor ${MIN_NEWS_BACKLOG}`
      );
      await logPipelineEvent(supabase, {
        stage: "health-check",
        level: "warn",
        message: `lowBacklog: ${health.newsBacklog} experimental news posts (floor ${MIN_NEWS_BACKLOG})`,
        meta: { backlog: health.newsBacklog, floor: MIN_NEWS_BACKLOG },
      });
    }
  }

  // Reset articles stuck in 'processing' — a crashed run leaves them behind
  // and they'd otherwise never be picked up again.
  const { data: stuckArticles, error: stuckError } = await supabase
    .from("news_raw_articles")
    .update({ status: "pending" })
    .eq("status", "processing")
    .lt("scraped_at", new Date(Date.now() - 2 * 3600_000).toISOString())
    .select("id");
  if (stuckError) {
    problems.push(
      `content health: stuck-article sweep failed: ${stuckError.message}`
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
      `content health: dead-article query failed: ${deadError.message}`
    );
  }
  const toRetry = (deadArticles ?? []).filter(
    (a) => !a.error_message || !a.error_message.startsWith("[retried]")
  );
  for (const article of toRetry) {
    const { error: retryError } = await supabase
      .from("news_raw_articles")
      .update({
        status: "pending",
        error_message: `[retried] ${article.error_message ?? ""}`,
      })
      .eq("id", article.id);
    if (!retryError) health.retriedArticles++;
  }

  // Pipeline errors in the last 24h.
  const { count: errorCount, error: errorCountError } = await supabase
    .from("content_pipeline_events")
    .select("*", { count: "exact", head: true })
    .eq("level", "error")
    .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  if (errorCountError) {
    problems.push(
      `content health: pipeline error-count query failed: ${errorCountError.message}`
    );
  }
  health.pipelineErrors24h = errorCount ?? 0;
  if (health.pipelineErrors24h > 5) {
    problems.push(
      `content health: ${health.pipelineErrors24h} pipeline errors in the last 24h`
    );
  }

  return health;
}
