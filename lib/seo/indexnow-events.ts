import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getEventIndexingReadiness,
  getEventsIndexingReadiness,
  type EventIndexingReadiness,
} from "@/lib/translations-readiness";
import { pingIndexNow } from "./indexnow";

/**
 * Resolve readiness on the server before submitting. This prevents mutation
 * flows from advertising locale URLs that still render source-language
 * fallbacks while the translation worker is catching up.
 */
export async function pingReadyEventLocales(
  supabase: SupabaseClient,
  eventId: string
): Promise<EventIndexingReadiness | null> {
  const readiness = await getEventIndexingReadiness(supabase, eventId);
  if (!readiness) return null;
  await pingIndexNow(readiness.readyPaths);
  return readiness;
}

/** Batch form used for recurring-event creation and series updates. */
export async function pingReadyEventsLocales(
  supabase: SupabaseClient,
  eventIds: string[]
): Promise<Map<string, EventIndexingReadiness>> {
  const readinessByEvent = await getEventsIndexingReadiness(supabase, eventIds);
  const paths = [...readinessByEvent.values()].flatMap((readiness) => readiness.readyPaths);
  await pingIndexNow(paths);
  return readinessByEvent;
}

export interface TranslationCompletionNotification {
  via: "app-callback" | "direct-indexnow";
  eventCount: number;
}

/**
 * Worker-side completion hook. Prefer the authenticated app callback because
 * it refreshes Next caches and the sitemap in addition to IndexNow. If the
 * worker does not carry either existing server secret (or the callback is down),
 * fall back to direct readiness-filtered IndexNow submission rather than
 * silently dropping discovery.
 */
export async function notifyEventTranslationCompletion(
  supabase: SupabaseClient,
  eventIds: string[]
): Promise<TranslationCompletionNotification> {
  const ids = [...new Set(eventIds)].filter(Boolean).slice(0, 100);
  if (ids.length === 0) return { via: "direct-indexnow", eventCount: 0 };

  const secret = process.env.CACHE_REVALIDATE_SECRET || process.env.CRON_SECRET;
  const baseUrl = (
    process.env.DALAT_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://dalat.app"
  ).replace(/\/$/, "");

  if (secret) {
    try {
      const response = await fetch(`${baseUrl}/api/translate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          operation: "complete",
          content_type: "event",
          content_id: ids[0],
          content_ids: ids,
        }),
      });
      if (response.ok) {
        const payload = await response.json() as { events?: unknown[] };
        if (Array.isArray(payload.events) && payload.events.length > 0) {
          return { via: "app-callback", eventCount: payload.events.length };
        }
        console.warn("[translation-complete] app callback found no matching events; using direct IndexNow fallback");
      } else {
        console.warn(`[translation-complete] app callback returned HTTP ${response.status}; using direct IndexNow fallback`);
      }
    } catch (error) {
      console.warn("[translation-complete] app callback failed; using direct IndexNow fallback", error);
    }
  }

  const readinessByEvent = await pingReadyEventsLocales(supabase, ids);
  return { via: "direct-indexnow", eventCount: readinessByEvent.size };
}
