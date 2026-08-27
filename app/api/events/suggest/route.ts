import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStorageProvider, isR2Configured } from "@/lib/storage";
import {
  COMMUNITY_SUGGESTION_SOURCE,
  fetchEventSourcePreview,
  normalizeSuggestionUrl,
  SuggestionSourceError,
} from "@/lib/events/event-suggestion";
import {
  flyerExtension,
  hasValidFlyerSignature,
  safeFlyerLabel,
  validateFlyerMetadata,
  type FlyerMimeType,
} from "@/lib/events/flyer-suggestion";
import { sanitizeFlyerImage } from "@/lib/events/flyer-suggestion.server";
import { MANUAL_REVIEW_QUEUE_TYPE } from "@/lib/import/queue-lanes";

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
  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const isMultipart = contentType.includes("multipart/form-data");
  if (!isJson && !isMultipart) {
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

  if (isMultipart) {
    let flyer: File;
    try {
      const formData = await request.formData();
      const entry = formData.get("flyer");
      if (!entry || typeof entry === "string") return jsonCode("invalid_flyer", 400);
      flyer = entry;
    } catch {
      return jsonCode("invalid_request", 400);
    }

    const validationCode = validateFlyerMetadata(flyer);
    if (validationCode) {
      return jsonCode(validationCode, validationCode === "flyer_too_large" ? 413 : 422);
    }

    const bytes = new Uint8Array(await flyer.arrayBuffer());
    if (!hasValidFlyerSignature(bytes, flyer.type)) {
      return jsonCode("invalid_flyer", 422);
    }

    const mimeType = flyer.type as FlyerMimeType;
    const sanitizedBytes = await sanitizeFlyerImage(bytes, mimeType);
    if (!sanitizedBytes) return jsonCode("invalid_flyer", 422);

    const hash = createHash("sha256").update(sanitizedBytes).digest("hex");
    const sourceUid = `flyer:${hash}`;
    const { data: existing, error: existingError } = await admin
      .from("import_queue")
      .select("id, status")
      .eq("source", COMMUNITY_SUGGESTION_SOURCE)
      .eq("source_uid", sourceUid)
      .maybeSingle();
    if (existingError) {
      console.error("[events/suggest] Flyer duplicate check failed:", existingError);
      return jsonCode("service_unavailable", 503);
    }
    if (existing && ["pending", "processing"].includes(existing.status)) {
      return jsonCode("queued_for_review", 202, { duplicate: true, reviewDelayed });
    }

    // This flow is R2-only. A Supabase fallback would bypass cdn.dalat.app
    // and violate the app's storage boundary.
    if (!isR2Configured()) return jsonCode("storage_unavailable", 503);
    // A content-addressed path keeps concurrent identical submissions
    // idempotent: every race writes the same object the unique queue row uses.
    const path = `community-suggestions/${hash}.${flyerExtension(mimeType)}`;
    const provider = await getStorageProvider("event-media");
    let flyerUrl: string;
    try {
      flyerUrl = await provider.upload("event-media", path, sanitizedBytes, {
        contentType: mimeType,
        cacheControl: "public, max-age=31536000, immutable",
      });
    } catch (error) {
      console.error("[events/suggest] Flyer upload failed:", error);
      return jsonCode("storage_unavailable", 503);
    }

    const submittedAt = new Date().toISOString();
    const flyerLabel = safeFlyerLabel(flyer.name);
    const queueRow = {
      source: COMMUNITY_SUGGESTION_SOURCE,
      type: MANUAL_REVIEW_QUEUE_TYPE,
      source_uid: sourceUid,
      status: "pending",
      attempts: 0,
      error_detail: null,
      processed_at: null,
      payload: {
        url: flyerUrl,
        title: flyerLabel,
        content: "",
        imageUrls: [flyerUrl],
        flyerUrl,
        fileName: flyerLabel,
        mimeType,
        fileSize: sanitizedBytes.length,
        originalFileSize: flyer.size,
        submittedBy: user.id,
        submittedAt,
        reviewMode: "manual",
      },
    };
    const insertQuery = existing
      ? admin
          .from("import_queue")
          .update(queueRow)
          .eq("id", existing.id)
          .in("status", ["done", "failed"])
          .select("id")
      : admin
          .from("import_queue")
          .upsert(queueRow, { onConflict: "source,source_uid", ignoreDuplicates: true })
          .select("id");
    const { data: inserted, error: insertError } = await insertQuery;
    if (insertError) {
      console.error("[events/suggest] Flyer queue insert failed:", insertError);
      return jsonCode("service_unavailable", 503);
    }

    return jsonCode("queued_for_review", 202, {
      duplicate: !inserted?.length,
      reviewDelayed,
    });
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
  const { data: existingUrl, error: existingUrlError } = await admin
    .from("import_queue")
    .select("id, status")
    .eq("source", COMMUNITY_SUGGESTION_SOURCE)
    .eq("source_uid", sourceUid)
    .maybeSingle();
  if (existingUrlError) {
    console.error("[events/suggest] URL duplicate check failed:", existingUrlError);
    return jsonCode("service_unavailable", 503);
  }
  if (existingUrl && ["pending", "processing"].includes(existingUrl.status)) {
    return jsonCode("queued_for_review", 202, { duplicate: true, reviewDelayed });
  }

  const queueRow = {
    source: COMMUNITY_SUGGESTION_SOURCE,
    type: "url",
    source_uid: sourceUid,
    status: "pending",
    attempts: 0,
    error_detail: null,
    processed_at: null,
    payload: {
      ...preview,
      submittedBy: user.id,
      submittedAt,
      originalUrl: rawUrl,
    },
  };
  const queueQuery = existingUrl
    ? admin
        .from("import_queue")
        .update(queueRow)
        .eq("id", existingUrl.id)
        .in("status", ["done", "failed"])
        .select("id")
    : admin
        .from("import_queue")
        .upsert(queueRow, { onConflict: "source,source_uid", ignoreDuplicates: true })
        .select("id");
  const { data: inserted, error: insertError } = await queueQuery;

  if (insertError) {
    console.error("[events/suggest] Queue insert failed:", insertError);
    return jsonCode("service_unavailable", 503);
  }

  return jsonCode("queued_for_review", 202, {
    duplicate: !inserted?.length,
    reviewDelayed,
  });
}
