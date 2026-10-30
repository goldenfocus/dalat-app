export type VenueEvent = { id: string; slug: string; title: string; venue_id: string | null; series_id: string | null; starts_at: string };

/** One row per recurring activity; retain every date for explicit date selection. */
export function groupVenueEvents(events: VenueEvent[]) {
  const groups = new Map<string, { event: VenueEvent; dates: VenueEvent[] }>();
  for (const event of [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const key = `${event.venue_id}:${event.series_id || event.id}`;
    const group = groups.get(key);
    if (group) group.dates.push(event);
    else groups.set(key, { event, dates: [event] });
  }
  return [...groups.values()];
}
