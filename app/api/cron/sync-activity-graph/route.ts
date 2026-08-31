import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncActivitySource } from "@/lib/activity-graph/ingest";
import type { ActivitySource } from "@/lib/activity-graph/types";
import { recordImportRun } from "@/lib/import/run-log";
import { createEmptyResult } from "@/lib/import/utils";
import { sendTelegram } from "@/lib/alerts/telegram";

export const runtime = "nodejs";
export const maxDuration = 300;

const LEASE_NAME = "scheduled-activity-graph-sync";
const LEASE_TTL_SECONDS = 360;
const ROUTE_BUDGET_MS = 240_000;
const MINIMUM_SOURCE_START_BUDGET_MS = 10_000;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[activity-graph] CRON_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[activity-graph] Supabase service configuration missing");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const startedAt = new Date();
  const routeDeadlineMs = startedAt.getTime() + ROUTE_BUDGET_MS;
  const leaseOwnerId = randomUUID();
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: leaseClaimed, error: leaseError } = await supabase.rpc(
    "claim_activity_sync_lease",
    {
      p_name: LEASE_NAME,
      p_owner_id: leaseOwnerId,
      p_now: startedAt.toISOString(),
      p_ttl_seconds: LEASE_TTL_SECONDS,
    },
  );
  if (leaseError) {
    console.error("[activity-graph] Lease claim failed:", leaseError);
    return NextResponse.json(
      { error: "Activity sync lease unavailable" },
      { status: 503 },
    );
  }
  if (leaseClaimed !== true) {
    console.log("[activity-graph] Overlapping run skipped");
    return NextResponse.json({
      ok: true,
      skipped: "run_already_in_progress",
      sourcesChecked: 0,
    });
  }

  try {
    const { data: staleSweep, error: staleSweepError } = await supabase.rpc(
      "expire_all_stale_activity_candidates",
      { p_checked_at: startedAt.toISOString() },
    );
    if (staleSweepError) {
      console.error(
        "[activity-graph] Global freshness sweep failed:",
        staleSweepError,
      );
      return NextResponse.json(
        { error: "Activity freshness sweep failed" },
        { status: 503 },
      );
    }
    const globalUnlisted =
      staleSweep && typeof staleSweep === "object"
        ? Number((staleSweep as { unlisted?: unknown }).unlisted) || 0
        : 0;

    const { data: sourceRows, error: sourceError } = await supabase
      .from("activity_sources")
      .select("*")
      .in("status", ["active", "degraded"])
      .eq("policy_status", "approved")
      // `manual` sources are refreshed by the autonomous scout. They still
      // participate in global stale expiry, but have no deterministic crawler
      // for this route to execute.
      .neq("fetch_mode", "manual")
      .lte("next_check_at", startedAt.toISOString())
      .order("trust_tier", { ascending: true })
      .order("next_check_at", { ascending: true })
      .limit(8);
    if (sourceError) {
      console.error("[activity-graph] Source query failed:", sourceError);
      return NextResponse.json(
        { error: "Activity source query failed" },
        { status: 503 },
      );
    }

    const sources = (sourceRows ?? []) as ActivitySource[];
    const results = [];
    const run = createEmptyResult();
    run.skipped += globalUnlisted;
    let rawSeen = 0;
    for (const source of sources) {
      if (routeDeadlineMs - Date.now() < MINIMUM_SOURCE_START_BUDGET_MS) break;
      const result = await syncActivitySource(supabase, source, new Date(), {
        routeDeadlineMs,
      });
      results.push(result);
      rawSeen += result.activitiesSeen;
      run.processed += result.published + result.updated + result.merged;
      run.skipped += result.withheld + result.rejected + result.unlisted;
      run.errors += result.errors.length;
      run.details.push(
        ...result.errors.map((error) => `${source.slug}: ${error}`),
      );
    }
    await recordImportRun(supabase, "activity-graph", startedAt, rawSeen, run);

    const published = results.reduce(
      (sum, result) => sum + result.published,
      0,
    );
    const unlisted =
      globalUnlisted +
      results.reduce((sum, result) => sum + result.unlisted, 0);
    const errors = results.reduce(
      (sum, result) => sum + result.errors.length,
      0,
    );
    const deferredSources = sources.length - results.length;
    if (errors > 0) {
      await sendTelegram(
        `🚨 <b>Activity Graph</b>\n${rawSeen} activities · ${published} new · ${unlisted} unlisted · ${errors} errors\n` +
          results
            .flatMap((result) => result.errors.slice(0, 2))
            .slice(0, 4)
            .join("\n"),
      );
    } else if (published > 0 || unlisted > 0) {
      await sendTelegram(
        `🌲 <b>Activity Graph</b>\n${published} verified activities published automatically · ${unlisted} stale activities unlisted automatically.`,
      );
    }

    console.log("[activity-graph] Sync complete", {
      sources: results.length,
      deferredSources,
      globalUnlisted,
      rawSeen,
      published,
      unlisted,
      errors,
    });
    return NextResponse.json(
      {
        ok: errors === 0,
        sourcesChecked: results.length,
        deferredSources,
        activitiesSeen: rawSeen,
        published,
        updated: results.reduce((sum, result) => sum + result.updated, 0),
        merged: results.reduce((sum, result) => sum + result.merged, 0),
        unlisted,
        withheld: results.reduce((sum, result) => sum + result.withheld, 0),
        rejected: results.reduce((sum, result) => sum + result.rejected, 0),
        errors,
        results,
      },
      { status: errors > 0 ? 207 : 200 },
    );
  } finally {
    const { error: releaseError } = await supabase.rpc(
      "release_activity_sync_lease",
      { p_name: LEASE_NAME, p_owner_id: leaseOwnerId },
    );
    if (releaseError) {
      console.error("[activity-graph] Lease release failed:", releaseError);
    }
  }
}
