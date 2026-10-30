import { expect, it } from "vitest";
import { groupVenueEvents, type VenueEvent } from "./event-groups";
const event = (id: string, series: string | null, date: string, venue = "social-house"): VenueEvent => ({ id, slug: id, title: id, series_id: series, venue_id: venue, starts_at: date });
it("shows each recurring activity once and retains chronological date choices", () => {
  const groups = groupVenueEvents([event("later", "exchange", "2026-11-11"), event("halloween", null, "2026-10-31"), event("next", "exchange", "2026-11-04")]);
  expect(groups.map(group => group.event.id)).toEqual(["halloween", "next"]);
  expect(groups[1].dates.map(date => date.id)).toEqual(["next", "later"]);
});
it("keeps events at different venues in separate groups", () => {
  expect(groupVenueEvents([event("one", "series", "2026-11-01"), event("two", "series", "2026-11-02", "other")])).toHaveLength(2);
});
