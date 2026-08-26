import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  COMMUNITY_SUGGESTION_SOURCE,
  fetchEventSourcePreview,
  normalizeSuggestionUrl,
  SuggestionSourceError,
} from "@/lib/events/event-suggestion";

export const runtime = "nodejs";
export const maxDuration = 30;

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING_QUEUE_ROWS = 250;
const DELAYED_QUEUE_AGE_MS = 24 * 60 * 60 * 1000;

function jsonCode(code: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ code, ...extra }, { status });
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonCode("invalid_request", 415);
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonCode("authentication_required", 401);

  // Fail closed: each accepted request performs a server-side fetch and adds
  // review work, so a broken limiter must not silently become an open one.
  const { data: rateCheck, error: rateError } = await supabase.rpc("check_rate_limit", {
    p_action: "suggest_event",
    p_limit: RATE_LIMIT,
    p_window_ms: RATE_WINDOW_MS,
  });
  if (rateError) {
    console.error("[events/suggest] Rate limit check failed:", rateError);
    return jsonCode("rate_limit_unavailable", 503);
  }
  if (!rateCheck?.allowed) {
    return jsonCode("rate_limit_exceeded", 429, { resetAt: rateCheck?.reset_at });
  }

  let rawUrl: unknown;
  try {
    ({ url: rawUrl } = await request.json());
  } catch {
    return jsonCode("invalid_request", 400);
  }
  if (typeof rawUrl !== "string" || rawUrl.length > 2_048) {
    return jsonCode("invalid_url", 400);
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    console.error("[events/suggest] Service-role configuration missing");
    return jsonCode("service_unavailable", 503);
  }
  const admin = createAdminClient(serviceUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // A dead worker must not turn public suggestions into an unbounded hidden
  // backlog. We still accept modest queues, but report a delayed review when
  // the oldest row has waited more than a day.
  const [{ count, error: countError }, { data: oldestRows, error: oldestError }] =
    await Promise.all([
      admin
        .from("import_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      admin
        .from("import_queue")
        .select("created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1),
    ]);
  if (countError || oldestError) {
    console.error("[events/suggest] Queue health check failed:", countError ?? oldestError);
    return jsonCode("service_unavailable", 503);
  }
  if ((count ?? 0) >= MAX_PENDING_QUEUE_ROWS) {
    return jsonCode("review_queue_full", 503);
  }
  const oldestCreatedAt = oldestRows?.[0]?.created_at;
  const reviewDelayed = Boolean(
    oldestCreatedAt && Date.now() - new Date(oldestCreatedAt).getTime() > DELAYED_QUEUE_AGE_MS
  );

  let preview;
  try {
    preview = await fetchEventSourcePreview(rawUrl);
  } catch (error) {
    if (error instanceof SuggestionSourceError) {
      return jsonCode(error.code, error.code === "source_too_large" ? 413 : 422);
    }
    console.error("[events/suggest] Source preview failed:", error);
    return jsonCode("source_unavailable", 502);
  }

  const sourceUid = normalizeSuggestionUrl(preview.url);
  const submittedAt = new Date().toISOString();
  const { data: inserted, error: insertError } = await admin
    .from("import_queue")
    .upsert(
      {
        source: COMMUNITY_SUGGESTION_SOURCE,
        type: "url",
        source_uid: sourceUid,
        payload: {
          ...preview,
          submittedBy: user.id,
          submittedAt,
          originalUrl: rawUrl,
        },
      },
      { onConflict: "source,source_uid", ignoreDuplicates: true }
    )
    .select("id");

  if (insertError) {
    console.error("[events/suggest] Queue insert failed:", insertError);
    return jsonCode("service_unavailable", 503);
  }

  return jsonCode("queued_for_review", 202, {
    duplicate: !inserted?.length,
    reviewDelayed,
  });
}
