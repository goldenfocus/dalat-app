import { groupRecurringChoices, type RecurringChoiceEvent } from "./recurring-choices";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
type ListingEvent = RecurringChoiceEvent & { ends_at?: string | null };

/** Match the lifecycle feed: explicit end time, otherwise four hours. */
export function eventListingLifecycle(event: ListingEvent, now: Date): "live" | "upcoming" | null {
  const start = Date.parse(event.starts_at);
  if (!Number.isFinite(start)) return null;
  if (start > now.getTime()) return "upcoming";
  const end = event.ends_at ? Date.parse(event.ends_at) : start + FOUR_HOURS_MS;
  return end > now.getTime() ? "live" : null;
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
