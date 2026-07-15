import { describe, it, expect, vi, afterEach } from "vitest";
import { groupByRecency } from "./date-groups";

// Noon UTC on a Wednesday = 7pm in Vietnam (UTC+7), same calendar day.
const NOW = new Date("2026-07-08T12:00:00Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

describe("groupByRecency", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("groups into today / yesterday / thisWeek / older in order", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const items = [
      { id: "old", published_at: hoursAgo(24 * 30) },
      { id: "now", published_at: hoursAgo(1) },
      { id: "week", published_at: hoursAgo(24 * 3) },
      { id: "yday", published_at: hoursAgo(24) },
    ];

    const groups = groupByRecency(items, (i) => i.published_at);

    expect(groups.map((g) => g.key)).toEqual([
      "today",
      "yesterday",
      "thisWeek",
      "older",
    ]);
    expect(groups[0].items[0].id).toBe("now");
    expect(groups[1].items[0].id).toBe("yday");
    expect(groups[2].items[0].id).toBe("week");
    expect(groups[3].items[0].id).toBe("old");
  });

  it("uses UTC+7 day boundaries, not UTC", () => {
    vi.useFakeTimers();
    // 18:00 UTC = 01:00 next day in Vietnam.
    vi.setSystemTime(new Date("2026-07-08T18:00:00Z"));

    // 17:30 UTC same day = 00:30 Jul 9 in Vietnam → "today" alongside now,
    // even though a pure-UTC grouping would agree; the distinguishing case:
    // 16:00 UTC = 23:00 Jul 8 in Vietnam → previous Vietnam day = "yesterday".
    const items = [
      { id: "same-vn-day", published_at: "2026-07-08T17:30:00Z" },
      { id: "prev-vn-day", published_at: "2026-07-08T16:00:00Z" },
    ];

    const groups = groupByRecency(items, (i) => i.published_at);

    expect(groups.find((g) => g.key === "today")?.items[0].id).toBe(
      "same-vn-day"
    );
    expect(groups.find((g) => g.key === "yesterday")?.items[0].id).toBe(
      "prev-vn-day"
    );
  });

  it("omits empty groups and sends null/invalid dates to older", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const items = [
      { id: "now", published_at: hoursAgo(1) },
      { id: "null-date", published_at: null as string | null },
      { id: "garbage", published_at: "not-a-date" },
    ];

    const groups = groupByRecency(items, (i) => i.published_at);

    expect(groups.map((g) => g.key)).toEqual(["today", "older"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["null-date", "garbage"]);
  });

  it("returns an empty array for no items", () => {
    expect(groupByRecency([], () => null)).toEqual([]);
  });
});
