import { describe, expect, it } from "vitest";
import { groupRecurringChoices, normalizeShowTitle } from "./recurring-choices";

const LULU = "5d8963e8-851c-4338-8136-e27bc1fa1d5e";

describe("normalizeShowTitle", () => {
  it("strips dates, times, years, and numbering", () => {
    expect(normalizeShowTitle("ACOUSTIC LIVE BAND | 11/10/2026")).toBe("acoustic live band");
    expect(normalizeShowTitle("Acoustic Live Band - Oct 12")).toBe("acoustic live band");
    expect(normalizeShowTitle("Acoustic Live Band (Sat, Oct 17th 2026) 7:30 PM")).toBe("acoustic live band");
    expect(normalizeShowTitle("Đêm nhạc Acoustic ngày 11 tháng 10")).toBe("dem nhac acoustic");
    expect(normalizeShowTitle("Improv Night #12")).toBe("improv night");
    expect(normalizeShowTitle("Book Club Vol. 3")).toBe("book club");
  });

  it("keeps distinct artist names apart", () => {
    expect(normalizeShowTitle("LÂN NHÃ - THÙY DUNG - ĐÀ LẠT")).not.toBe(
      normalizeShowTitle("PHƯƠNG LINH - DA LAT"),
    );
  });
});

describe("groupRecurringChoices", () => {
  it("collapses standalone nightly rows at one venue into the soonest date", () => {
    const groups = groupRecurringChoices([
      { id: "c", title: "ACOUSTIC LIVE BAND | 14/10/2026", starts_at: "2026-10-14T12:30:00Z", venue_id: LULU, location_name: "LuLuLoLa Coffee+" },
      { id: "a", title: "ACOUSTIC LIVE BAND | 11/10/2026", starts_at: "2026-10-11T12:30:00Z", venue_id: LULU, location_name: "LuLuLoLa Coffee+" },
      // Later rows that were never linked to the venue record still group by place name.
      { id: "d", title: "ACOUSTIC LIVE BAND | 19/10/2026", starts_at: "2026-10-19T12:30:00Z", venue_id: null, location_name: "LuLuLoLa Coffee+" },
      { id: "one-off", title: "Văn Mai Hương Live in DaLat", starts_at: "2026-10-12T12:00:00Z", venue_id: LULU, location_name: "LuLuLoLa Coffee+" },
    ]);

    expect(groups.map((group) => group.event.id)).toEqual(["a", "one-off"]);
    expect(groups[0].occurrences.map((event) => event.id)).toEqual(["a", "c", "d"]);
    expect(groups[1].occurrences).toHaveLength(1);
  });

  it("groups a proper series by series_id even when titles differ", () => {
    const groups = groupRecurringChoices([
      { id: "s2", title: "Live Acoustic", starts_at: "2026-10-12T12:30:00Z", series_id: "s" },
      { id: "s1", title: "Live Acoustic (special guest)", starts_at: "2026-10-11T12:30:00Z", series_id: "s" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].event.id).toBe("s1");
    expect(groups[0].occurrences).toHaveLength(2);
  });

  it("does not merge the same title at different venues or with no venue", () => {
    const groups = groupRecurringChoices([
      { id: "a", title: "Yoga", starts_at: "2026-10-11T01:00:00Z", location_name: "Studio A" },
      { id: "b", title: "Yoga", starts_at: "2026-10-12T01:00:00Z", location_name: "Studio B" },
      { id: "c", title: "Yoga", starts_at: "2026-10-13T01:00:00Z" },
      { id: "d", title: "Yoga", starts_at: "2026-10-14T01:00:00Z" },
    ]);
    expect(groups.map((group) => group.event.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("orders shows by their soonest date", () => {
    const groups = groupRecurringChoices([
      { id: "late-show", title: "Jazz | 20/10", starts_at: "2026-10-20T12:00:00Z", location_name: "X" },
      { id: "early-one-off", title: "Talk", starts_at: "2026-10-15T12:00:00Z", location_name: "Y" },
      { id: "early-show", title: "Jazz | 10/10", starts_at: "2026-10-10T12:00:00Z", location_name: "X" },
    ]);
    expect(groups.map((group) => group.event.id)).toEqual(["early-show", "early-one-off"]);
  });
});
