import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/event-translation", () => ({ schedulePublishedEventTranslation: vi.fn() }));

import { findSeriesForShow } from "./scout-ingest";

function mockSupabase(series: unknown[], takenDates: string[] = []) {
  return {
    from: vi.fn((table: string) => {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn((column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      });
      builder.limit = vi.fn(() => builder);
      builder.then = (resolve: (value: unknown) => unknown) => {
        if (table === "event_series") return Promise.resolve({ data: series, error: null }).then(resolve);
        const taken = takenDates.includes(String(filters.series_instance_date));
        return Promise.resolve({ data: taken ? [{ id: "x" }] : [], error: null }).then(resolve);
      };
      return builder;
    }),
  } as never;
}

const lulu = {
  id: "series-lulu",
  title: "Acoustic Live Band",
  location_name: "LuLuLoLa Coffee+",
  venue_id: "venue-lulu",
  status: "paused",
  source_platform: null,
};

describe("findSeriesForShow", () => {
  it("attaches a dated standalone title to the matching series", async () => {
    const link = await findSeriesForShow(
      mockSupabase([lulu]),
      "ACOUSTIC LIVE BAND | 02/11/2026",
      "Lululola Coffee+",
      new Date("2026-11-02T12:30:00Z"),
    );
    expect(link).toEqual({ seriesId: "series-lulu", instanceDate: "2026-11-02", venueId: "venue-lulu" });
  });

  it("uses the Đà Lạt calendar date", async () => {
    const link = await findSeriesForShow(
      mockSupabase([lulu]),
      "ACOUSTIC LIVE BAND",
      "LuLuLoLa Coffee+",
      new Date("2026-11-02T18:30:00Z"), // 01:30 on Nov 3 in Đà Lạt
    );
    expect(link?.instanceDate).toBe("2026-11-03");
  });

  it("returns null for another venue, a cancelled or Activity Graph series, or a taken date", async () => {
    const start = new Date("2026-11-02T12:30:00Z");
    expect(await findSeriesForShow(mockSupabase([lulu]), "Acoustic Live Band", "Other Café", start)).toBeNull();
    expect(await findSeriesForShow(mockSupabase([{ ...lulu, status: "cancelled" }]), "Acoustic Live Band", "LuLuLoLa Coffee+", start)).toBeNull();
    expect(await findSeriesForShow(mockSupabase([{ ...lulu, source_platform: "activity-graph" }]), "Acoustic Live Band", "LuLuLoLa Coffee+", start)).toBeNull();
    expect(await findSeriesForShow(mockSupabase([lulu], ["2026-11-02"]), "Acoustic Live Band", "LuLuLoLa Coffee+", start)).toBeNull();
  });
});
