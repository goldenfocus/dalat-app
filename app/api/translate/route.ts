import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { CACHE_TAGS } from "@/lib/cache/server-cache";
import { stampExistingNewsContentRevision } from "@/lib/news/article-policy";
import { pingReadyEventsLocales } from "@/lib/seo/indexnow-events";
import type {
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

const BLOG_TRANSLATABLE_FIELDS = new Set([
  "title",
  "story_content",
  "technical_content",
  "meta_description",
]);

function asStoredText(value: unknown): string {
  return typeof value === "string" ? value : "";
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
 *
 * Durably marks saved source fields as changed for the Mac mini worker. Blog
 * edits advance the factual revision and automatic rows are invalidated before
 * success is returned; the worker then discovers missing/stale coverage.
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

  const suppliedFields = body.fields.filter(
    (field) =>
      field &&
      typeof field.field_name === "string" &&
      typeof field.text === "string"
  );
  if (suppliedFields.length === 0) {
    return NextResponse.json(
      { error: "No valid fields to translate" },
      { status: 400 }
    );
  }

  const fieldsToTranslate = suppliedFields.filter(
    (field) => field.text.trim().length > 0
  );
  if (fieldsToTranslate.length === 0 && body.content_type !== "event") {
    return NextResponse.json(
      { error: "No non-empty fields to translate" },
      { status: 400 }
    );
  }

  const fieldNames = [
    ...new Set(suppliedFields.map((field) => field.field_name)),
  ];

  try {
    if (body.content_type === "event") {
      // Empty fields still need invalidation: deleting a description must
      // remove its old translations even though there is nothing to regenerate.
      const eventFieldNames = fieldNames
        .filter((field) => field === "title" || field === "description");

      if (eventFieldNames.length === 0) {
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
        .in("field_name", eventFieldNames);

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
        invalidated_fields: eventFieldNames,
        translations_count: 0,
        ...batchReadinessResponse(readinessByEvent),
      }, { status: 202 });
    }

    // Event batch operations are handled above. Other content types mutate one
    // saved source item at a time so exact source verification remains possible.
    if (!body.content_id || eventIds.length !== 1) {
      return NextResponse.json(
        { error: "Queueing non-event translations requires one content_id" },
        { status: 400 }
      );
    }

    let mutationClient = supabase;

    if (body.content_type === "blog") {
      if (fieldNames.some((fieldName) => !BLOG_TRANSLATABLE_FIELDS.has(fieldName))) {
        return NextResponse.json({ error: "Unsupported blog translation field" }, { status: 400 });
      }

      // Blog editors can be granted `can_blog` without an admin role, while
      // the older translation-row RLS policy recognizes only role names. Use
      // the established SECURITY DEFINER permission check, then a server-only
      // client for the coupled revision/invalidation mutation.
      const { data: canBlog, error: canBlogError } = await supabase.rpc("user_can_blog", {
        p_user_id: user.id,
      });
      if (canBlogError || canBlog !== true) {
        if (canBlogError) console.error("[translate] Blog permission check failed:", canBlogError);
        return NextResponse.json({ error: "Not authorized to edit blog translations" }, { status: 403 });
      }
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: "Blog translation service is not configured" }, { status: 503 });
      }
      mutationClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // This request follows update_blog_post. Verify it still describes the
      // exact stored revision; a delayed tab must not invalidate translations
      // for a newer edit.
      const { data: post, error: postError } = await mutationClient
        .from("blog_posts")
        .select("id, source, source_urls, updated_at, title, story_content, technical_content, meta_description")
        .eq("id", body.content_id)
        .maybeSingle();
      if (postError) {
        console.error("[translate] Failed to read saved blog revision:", postError);
        return NextResponse.json({ error: "Failed to verify saved blog revision" }, { status: 500 });
      }
      if (!post) {
        return NextResponse.json({ error: "Blog post not found or not editable" }, { status: 404 });
      }
      const staleRequest = suppliedFields.some((field) =>
        asStoredText(post[field.field_name as keyof typeof post]) !== field.text
      );
      if (staleRequest) {
        return NextResponse.json(
          { error: "Blog post changed again before translation invalidation" },
          { status: 409 }
        );
      }

      // Modern automated news uses content_updated_at as its factual revision
      // rather than generic row churn. An editor save must advance that marker
      // before old translations are removed so every public reader fails closed
      // during the transition. Compare-and-set prevents overwriting a newer
      // concurrent provenance/fact revision.
      if (post.source === "news_scrape") {
        const stampedSources = stampExistingNewsContentRevision(
          post.source_urls,
          post.updated_at
        );
        if (stampedSources) {
          const { data: stampedRows, error: stampError } = await mutationClient
            .from("blog_posts")
            .update({ source_urls: stampedSources })
            .eq("id", post.id)
            .eq("updated_at", post.updated_at)
            .select("id");
          if (stampError) {
            console.error("[translate] Failed to stamp blog content revision:", stampError);
            return NextResponse.json({ error: "Failed to stamp blog content revision" }, { status: 500 });
          }
          if (stampedRows?.length !== 1) {
            return NextResponse.json(
              { error: "Blog post changed again before revision stamping" },
              { status: 409 }
            );
          }
        }
      }
    }

    // Reviewed/edited translations remain human-owned but readers hide them
    // when older than the new source revision. Automatic rows are removed so
    // the bounded worker sweep can rebuild them from the current fields.
    const { error: invalidateError } = await mutationClient
      .from("content_translations")
      .delete()
      .eq("content_type", body.content_type)
      .eq("content_id", body.content_id)
      .eq("translation_status", "auto")
      .in("field_name", fieldNames);
    if (invalidateError) {
      console.error("[translate] Failed to invalidate automatic translations:", invalidateError);
      return NextResponse.json({ error: "Failed to invalidate translations" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      operation,
      queued: true,
      translations_count: fieldsToTranslate.length,
    }, { status: 202 });
  } catch (error) {
    console.error("Translation queue error:", error);

    return NextResponse.json(
      { error: "Failed to queue translation" },
      { status: 500 }
    );
  }
}
