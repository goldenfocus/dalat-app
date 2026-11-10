import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithSeriesData } from "@/lib/types";

const getCachedEventsByLifecycle = vi.fn();

vi.mock("@/lib/cache/server-cache", () => ({
  getCachedEventsByLifecycle: (...args: unknown[]) =>
    getCachedEventsByLifecycle(...args),
}));
// React cache() only memoises inside a server render; pass through in tests.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

import { getHomeFeed } from "./home-feed";

function event(id: string, hour: number): EventWithSeriesData {
  return {
    id,
    starts_at: `2026-11-20T${String(hour).padStart(2, "0")}:00:00Z`,
    venue_id: `venue-${id}`,
    location_name: `Place ${id}`,
  } as EventWithSeriesData;
}

function serve(happening: EventWithSeriesData[], upcoming: EventWithSeriesData[]) {
  getCachedEventsByLifecycle.mockImplementation(async (lifecycle: string) =>
    lifecycle === "happening" ? happening : upcoming,
  );
}

const upcoming = Array.from({ length: 20 }, (_, i) => event(`u${i}`, i));

describe("getHomeFeed", () => {
  beforeEach(() => getCachedEventsByLifecycle.mockReset());

  it("features the first live event and leaves the upcoming grid whole", async () => {
    serve([event("live1", 1), event("live2", 2)], upcoming);
    const feed = await getHomeFeed(true);

    expect(feed.featured).toMatchObject({ live: true, event: { id: "live1" } });
    expect(feed.happeningEvents.map((e) => e.id)).toEqual(["live2"]);
    expect(feed.upcomingEvents).toHaveLength(12);
    expect(feed.upcomingEvents[0].id).toBe("u0");
  });

  it("features the next event when nothing is live, without repeating it", async () => {
    serve([], upcoming);
    const feed = await getHomeFeed(false);

    expect(feed.featured).toMatchObject({ live: false, event: { id: "u0" } });
    expect(feed.happeningEvents).toEqual([]);
    expect(feed.upcomingEvents).toHaveLength(12);
    expect(feed.upcomingEvents.map((e) => e.id)).not.toContain("u0");
    expect(feed.hasMoreUpcoming).toBe(true);
  });

  it("skips the live query when the page already knows nothing is live", async () => {
    serve([event("live1", 1)], upcoming);
    const feed = await getHomeFeed(false);

    expect(feed.featured?.live).toBe(false);
    expect(getCachedEventsByLifecycle).not.toHaveBeenCalledWith(
      "happening",
      expect.anything(),
    );
  });

  it("has no featured event and no hidden rows on an empty calendar", async () => {
    serve([], []);
    const feed = await getHomeFeed(false);

    expect(feed.featured).toBeNull();
    expect(feed.upcomingEvents).toEqual([]);
    expect(feed.hasMoreUpcoming).toBe(false);
  });
});
