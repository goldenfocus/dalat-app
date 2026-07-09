import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegram } from "@/lib/alerts/telegram";
import { materializeSeriesOccurrences } from "@/lib/series/materialize";
import type { EventSeries } from "@/lib/types";

export const maxDuration = 60;

// The customer promise: the homepage must never look dead.
// Watches what visitors see, not the plumbing.
const MIN_UPCOMING_14D = 8;

// A watched source with no run in this window is presumed dead.
const MAX_HEARTBEAT_AGE_H = 48;

// Add "facebook" once the Apify schedule is re-enabled (it webhooks daily).
const WATCHED_SOURCES = ["dalat-gov"];

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

  if (problems.length > 0) {
    await sendTelegram(
      `🚨 <b>dalat.app event health</b>\n${problems.map((p) => `• ${p}`).join("\n")}`
    );
  }

  return NextResponse.json({
    ok: problems.length === 0,
    upcoming: upcoming ?? 0,
    seriesToppedUp: toppedUp,
    problems,
  });
}
