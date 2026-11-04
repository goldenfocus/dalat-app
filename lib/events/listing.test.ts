import { describe, expect, it } from "vitest";
import { activeEventListingFilter, eventListingLifecycle, groupActiveEventChoices } from "./listing";
const now = new Date("2026-11-04T11:30:00Z");
const event = (id: string, starts_at: string, ends_at: string | null = null, series_id?: string) => ({ id, title: id, starts_at, ends_at, series_id });
describe("Events listing lifecycle", () => {
  it("keeps an event visible when its start time passes, until its explicit end", () => {
    const row = event("exchange", "2026-11-04T11:00:00Z", "2026-11-04T13:00:00Z");
    expect(eventListingLifecycle(row, new Date("2026-11-04T10:59:59Z"))).toBe("upcoming");
    expect(eventListingLifecycle(row, new Date(row.starts_at))).toBe("live");
    expect(eventListingLifecycle(row, now)).toBe("live");
    expect(eventListingLifecycle(row, new Date("2026-11-04T13:00:00Z"))).toBeNull();
  });
  it("uses four hours only when the end is absent", () => {
    expect(eventListingLifecycle(event("long", "2026-11-03T00:00:00Z", "2026-11-05T00:00:00Z"), now)).toBe("live");
    expect(eventListingLifecycle(event("short", "2026-11-04T10:00:00Z", "2026-11-04T11:00:00Z"), now)).toBeNull();
    expect(eventListingLifecycle(event("fallback", "2026-11-04T08:00:00Z"), now)).toBe("live");
    expect(eventListingLifecycle(event("ended", "2026-11-04T07:30:00Z"), now)).toBeNull();
  });
  it("shows the live recurring date once, with later dates retained in its hint", () => {
    const rows = [event("next", "2026-11-11T11:00:00Z", null, "series"), event("past", "2026-10-28T11:00:00Z", null, "series"), event("live", "2026-11-04T11:00:00Z", "2026-11-04T13:00:00Z", "series"), event("other", "2026-11-04T12:00:00Z")];
    const groups = groupActiveEventChoices(rows, now);
    expect(groups.map(g => g.event.id)).toEqual(["live", "other"]);
    expect(groups[0].occurrences.map(e => e.id)).toEqual(["live", "next"]);
  });
  it("does not fill the first page with ended events or let future dates hide a live show", () => {
    const rows = Array.from({ length: 30 }, (_, i) => event(`future-${i}`, "2026-11-05T11:00:00Z"));
    const groups = groupActiveEventChoices([...rows, event("live", "2026-11-04T11:00:00Z"), event("ended", "2026-11-01T11:00:00Z")], now);
    expect(groups.slice(0, 24)[0].event.id).toBe("live");
    expect(groups).toHaveLength(31);
  });
  it("queries explicit long-running ends as well as short missing-end fallbacks", () => {
    expect(activeEventListingFilter(now)).toBe("starts_at.gt.2026-11-04T11:30:00.000Z,ends_at.gt.2026-11-04T11:30:00.000Z,and(ends_at.is.null,starts_at.gt.2026-11-04T07:30:00.000Z)");
  });
});
