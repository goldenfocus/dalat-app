import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CACHE_TAGS } from "@/lib/cache/server-cache";
import { pingReadyEventsLocales } from "@/lib/seo/indexnow-events";
import {
  TranslationContentType,
  TranslationFieldName,
} from "@/lib/types";
import type { EventIndexingReadiness } from "@/lib/translations-readiness";

const RATE_LIMIT = 50; // requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface TranslateRequest {
  operation?: "queue" | "discover" | "complete";
  content_type: TranslationContentType;
  content_id?: string;
  content_ids?: string[];
  fields?: {
    field_name: TranslationFieldName;
    text: string;
  }[];
  detect_language?: boolean;
}

function revalidateEventReadiness(readiness: EventIndexingReadiness): void {
  revalidateTag(CACHE_TAGS.translations, "max");
  for (const locale of readiness.locales) {
    revalidatePath(locale.path);
  }
  // Translation timestamps are sitemap freshness signals and ready locales can
  // enter/leave the event sitemap after a queue or completion transition.
  revalidatePath("/sitemap.xml");
}

function readinessResponse(readiness: EventIndexingReadiness | null) {
  if (!readiness) {
    return {
      event_found: false,
      content_ready: false,
      content_blocking_issues: [],
      content_warnings: [],
      ready_locales: [],
      all_locales_ready: false,
      last_modified: null,
    };
  }

  return {
    event_found: true,
    content_ready: readiness.contentReady,
    content_blocking_issues: readiness.content.blockingIssues,
    content_warnings: readiness.content.warnings,
    ready_locales: readiness.readyLocales,
    all_locales_ready: readiness.allLocalesReady,
    last_modified: readiness.lastModified,
  };
}

function eventIdsFromBody(body: TranslateRequest): string[] {
  return [...new Set([
    ...(body.content_id ? [body.content_id] : []),
    ...(Array.isArray(body.content_ids)
      ? body.content_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
      : []),
  ])];
}

function batchReadinessResponse(readinessByEvent: Map<string, EventIndexingReadiness>) {
  const events = [...readinessByEvent.values()].map((readiness) => ({
    event_id: readiness.eventId,
    content_ready: readiness.contentReady,
    content_blocking_issues: readiness.content.blockingIssues,
    content_warnings: readiness.content.warnings,
    ready_locales: readiness.readyLocales,
    all_locales_ready: readiness.allLocalesReady,
    last_modified: readiness.lastModified,
  }));
  const first = events[0];

  return {
    ...readinessResponse(
      first ? readinessByEvent.get(first.event_id) ?? null : null
    ),
    events,
    ready_url_count: [...readinessByEvent.values()]
      .reduce((count, readiness) => count + readiness.readyPaths.length, 0),
  };
}

/**
 * POST /api/translate
 *
 * queue (default): invalidates the event fields that changed. Missing rows are
 * the durable queue consumed by the Mac mini worker.
 *
 * discover: re-checks a published event after a non-text mutation and submits
 * every already-ready locale URL to IndexNow.
 *
 * complete: worker callback after translation upserts. It is protected by an
 * existing server secret and submits only locale URLs whose required
 * translations are complete and substantive.
 */
export async function POST(request: Request) {
  let body: TranslateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const operation = body.operation ?? "queue";
  const eventIds = eventIdsFromBody(body);
  if (eventIds.length > 100) {
    return NextResponse.json(
      { error: "A maximum of 100 event content_ids is allowed per request" },
      { status: 400 }
    );
  }
  const supabase = await createClient();

  if (operation === "complete") {
    const webhookSecret = process.env.CACHE_REVALIDATE_SECRET || process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    // Fail closed when the shared server secret is not configured.
    if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (body.content_type !== "event" || eventIds.length === 0) {
      return NextResponse.json(
        { error: "complete currently requires an event content_id" },
        { status: 400 }
      );
    }

    try {
      const readinessByEvent = await pingReadyEventsLocales(supabase, eventIds);
      for (const readiness of readinessByEvent.values()) {
        revalidateEventReadiness(readiness);
      }
      return NextResponse.json({
        success: true,
        operation,
        ...batchReadinessResponse(readinessByEvent),
      });
    } catch (error) {
      console.error("[translate] Completion processing failed:", error);
      return NextResponse.json(
        { error: "Failed to process translation completion" },
        { status: 500 }
      );
    }
  }

  // Queue/discovery calls originate from authenticated content mutations.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!body.content_type || eventIds.length === 0) {
    return NextResponse.json(
      { error: "content_type and content_id are required" },
      { status: 400 }
    );
  }

  if (operation === "discover") {
    if (body.content_type !== "event") {
      return NextResponse.json(
        { error: "discover currently supports events only" },
        { status: 400 }
      );
    }

    try {
      const readinessByEvent = await pingReadyEventsLocales(supabase, eventIds);
      for (const readiness of readinessByEvent.values()) {
        revalidateEventReadiness(readiness);
      }
      return NextResponse.json({
        success: true,
        operation,
        ...batchReadinessResponse(readinessByEvent),
      });
    } catch (error) {
      console.error("[translate] Event discovery failed:", error);
      return NextResponse.json(
        { error: "Failed to submit event discovery" },
        { status: 500 }
      );
    }
  }

  if (operation !== "queue") {
    return NextResponse.json({ error: "Unknown operation" }, { status: 400 });
  }

  // Database-backed rate limiting applies to translation work, not discovery.
  const { data: rateCheck, error: rateError } = await supabase.rpc("check_rate_limit", {
    p_action: "translate",
    p_limit: RATE_LIMIT,
    p_window_ms: RATE_WINDOW_MS,
  });

  if (rateError) {
    console.error("[translate] Rate limit check failed:", rateError);
  } else if (!rateCheck?.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Try again later.",
        remaining: 0,
        reset_at: rateCheck?.reset_at,
      },
      { status: 429 }
    );
  }

  if (!body.fields || body.fields.length === 0) {
    return NextResponse.json(
      { error: "At least one field is required" },
      { status: 400 }
    );
  }

  const fieldsToTranslate = body.fields.filter(
    (field) => field.text && field.text.trim().length > 0
  );
  if (fieldsToTranslate.length === 0 && body.content_type !== "event") {
    return NextResponse.json(
      { error: "No non-empty fields to translate" },
      { status: 400 }
    );
  }

  try {
    if (body.content_type === "event") {
      // Empty fields still need invalidation: deleting a description must
      // remove its old translations even though there is nothing to regenerate.
      const fieldNames = [...new Set(body.fields.map((field) => field.field_name))]
        .filter((field) => field === "title" || field === "description");

      if (fieldNames.length === 0) {
        return NextResponse.json(
          { error: "No indexable event fields to translate" },
          { status: 400 }
        );
      }

      // `detect_language` is fulfilled by the Mac mini worker. Null is an
      // explicit pending-detection state; readiness blocks every locale until
      // the worker persists the detected source language.
      if (body.detect_language && fieldsToTranslate.length > 0) {
        const { error: sourceLocaleError } = await supabase
          .from("events")
          .update({ source_locale: null })
          .in("id", eventIds);
        if (sourceLocaleError) {
          throw new Error(`source locale invalidation failed: ${sourceLocaleError.message}`);
        }
      }

      // Deleting only changed fields is the durable worker queue. It also
      // prevents stale source-language fallbacks from being treated as ready
      // localized pages while replacement translations are pending.
      const { error: invalidateError } = await supabase
        .from("content_translations")
        .delete()
        .eq("content_type", "event")
        .in("content_id", eventIds)
        .in("field_name", fieldNames);

      if (invalidateError) {
        throw new Error(`translation invalidation failed: ${invalidateError.message}`);
      }

      const readinessByEvent = await pingReadyEventsLocales(supabase, eventIds);
      for (const readiness of readinessByEvent.values()) {
        revalidateEventReadiness(readiness);
      }

      return NextResponse.json({
        success: true,
        operation,
        queued: true,
        invalidated_fields: fieldNames,
        translations_count: 0,
        ...batchReadinessResponse(readinessByEvent),
      }, { status: 202 });
    }

    // Other content types retain the existing missing-row sweep behavior.
    return NextResponse.json({
      success: true,
      operation,
      queued: true,
      translations_count: 0,
    }, { status: 202 });
  } catch (error) {
    console.error("Translation queue error:", error);

    return NextResponse.json(
      { error: "Failed to queue translation" },
      { status: 500 }
    );
  }
}
