import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  EVENT_TRANSLATION_BATCH_LIMIT,
  sweepPublishedEventTranslations,
} from "@/lib/event-translation";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Event-only translation sweep. Does not load blog or moment jobs.
 * Vercel Cron sends Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[translate-events] CRON_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[translate-events] Supabase service configuration missing");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const requestUrl = new URL(request.url);
  const parsedLimit = Number(requestUrl.searchParams.get("limit"));
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(5, Math.max(1, Math.floor(parsedLimit)))
    : EVENT_TRANSLATION_BATCH_LIMIT;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await sweepPublishedEventTranslations(supabase, { limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[translate-events]", error);
    return NextResponse.json(
      { error: "Event translation sweep failed" },
      { status: 500 },
    );
  }
}
