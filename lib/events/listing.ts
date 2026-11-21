import { hasLamVienTbdSchedule } from "@/lib/activity-graph/lam-vien-tbd";
import { groupRecurringChoices, type RecurringChoiceEvent } from "./recurring-choices";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
type ListingEvent = RecurringChoiceEvent & {
  ends_at?: string | null;
  source_metadata?: Record<string, unknown> | null;
};

/** An editorial duplicate stays published at its own URL for existing attendees. */
export function isDiscoveryDuplicate(metadata?: Record<string, unknown> | null): boolean {
  return typeof metadata?.discovery_duplicate_of === "string" &&
    metadata.discovery_duplicate_of.trim().length > 0;
}

/** Match the lifecycle feed: explicit end time, otherwise four hours. */
export function eventListingLifecycle(event: ListingEvent, now: Date): "live" | "upcoming" | null {
  if (isDiscoveryDuplicate(event.source_metadata)) return null;
  const start = Date.parse(event.starts_at);
  if (!Number.isFinite(start)) return null;
  if (start > now.getTime()) return "upcoming";
  const end = event.ends_at ? Date.parse(event.ends_at) : start + FOUR_HOURS_MS;
  if (!(end > now.getTime())) return null;
  return hasLamVienTbdSchedule(event.source_metadata) ? "upcoming" : "live";
}

/** Select active rows before grouping/pagination so a live date represents its series. */
export function groupActiveEventChoices<T extends ListingEvent>(events: readonly T[], now: Date) {
  return groupRecurringChoices(events.filter(event => eventListingLifecycle(event, now) !== null))
    .sort((a, b) => {
      const liveA = eventListingLifecycle(a.event, now) === "live";
      const liveB = eventListingLifecycle(b.event, now) === "live";
      return liveA === liveB ? Date.parse(a.event.starts_at) - Date.parse(b.event.starts_at) : liveA ? -1 : 1;
    });
}

/** PostgREST OR expression; never fetch the entire historical events table. */
export function activeEventListingFilter(now: Date): string {
  const timestamp = now.toISOString();
  const fallbackStart = new Date(now.getTime() - FOUR_HOURS_MS).toISOString();
  return `starts_at.gt.${timestamp},ends_at.gt.${timestamp},and(ends_at.is.null,starts_at.gt.${fallbackStart})`;
}
