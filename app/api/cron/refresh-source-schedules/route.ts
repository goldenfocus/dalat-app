import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { refreshPublishedSourceSchedules } from "@/lib/import/source-schedule-refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily: re-check upcoming published events from structured sources
 * (schema.org Event pages) and move them when the source date/time changed.
 * Vercel Cron sends Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const outcomes = await refreshPublishedSourceSchedules(supabase, {
      deadlineMs: Date.now() + 240_000,
    });
    const count = (status: string) =>
      outcomes.filter((outcome) => outcome.status === status).length;
    const body = {
      ok: true,
      checked: outcomes.length,
      updated: outcomes.filter((outcome) => outcome.status === "updated"),
      unchanged: count("unchanged"),
      skipped: count("skipped"),
      sourceRemoved: count("source_removed"),
      sourceRestored: count("source_restored"),
      unlisted: outcomes.filter((outcome) => outcome.status === "unlisted"),
      errors: count("error"),
    };
    console.log("[refresh-source-schedules]", JSON.stringify(body));
    return NextResponse.json(body);
  } catch (error) {
    console.error("[refresh-source-schedules]", error);
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}
