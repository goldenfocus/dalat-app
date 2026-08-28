import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventSeries } from "@/lib/types";
import {
  isFreshActivityGraphSeries,
  materializeSeriesOccurrences,
  pauseStaleActivityGraphSeries,
  planSeriesOccurrences,
  topUpSeriesOccurrences,
} from "./materialize";

function series(overrides: Partial<EventSeries> = {}): EventSeries {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "nightly-acoustic",
    title: "Nightly acoustic",
    description: null,
    image_url: null,
    location_name: "Official Venue",
    address: "Đà Lạt",
    google_maps_url: null,
    latitude: null,
    longitude: null,
    external_chat_url: "https://example.com/acoustic",
    timezone: "Asia/Ho_Chi_Minh",
    capacity: null,
    is_online: false,
    online_link: null,
    title_position: "bottom",
    image_fit: "cover",
    focal_point: null,
    price_type: null,
    ticket_tiers: null,
    tribe_id: null,
    organizer_id: null,
    venue_id: null,
    created_by: "22222222-2222-4222-8222-222222222222",
    rrule: "FREQ=DAILY",
    starts_at_time: "19:30:00",
    duration_minutes: 120,
    first_occurrence: "2026-08-28",
    rrule_until: null,
    rrule_count: null,
    status: "active",
    instances_generated_until: null,
    created_at: "2026-08-28T00:00:00.000Z",
    updated_at: "2026-08-28T00:00:00.000Z",
    source_platform: "activity-graph",
    source_metadata: {},
    activity_kind: "recurring_activity",
    public_access: "confirmed",
    reservation_requirement: "recommended",
    last_checked_at: "2026-08-28T09:00:00.000Z",
    last_confirmed_at: "2026-08-28T09:00:00.000Z",
    source_updated_at: null,
    freshness_score: 100,
    ...overrides,
  };
}

function writeClient() {
  const writes: Array<{ table: string; values: Record<string, unknown> }> = [];
  const inserted: Array<Record<string, unknown>> = [];
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  const from = vi.fn((table: string) => {
    let selected = "";
    const builder: Record<string, ReturnType<typeof vi.fn>> & {
      then?: (resolve: (value: unknown) => unknown) => Promise<unknown>;
    } = {};
    builder.select = vi.fn((columns: string) => {
      selected = columns;
      return builder;
    });
    builder.eq = vi.fn(() => builder);
    builder.gte = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.update = vi.fn((values: Record<string, unknown>) => {
      writes.push({ table, values });
      return builder;
    });
    builder.insert = vi.fn((values: Array<Record<string, unknown>>) => {
      inserted.push(...values);
      return builder;
    });
    builder.upsert = vi.fn((values: Array<Record<string, unknown>>) => {
      inserted.push(...values);
      return builder;
    });
    builder.then = (resolve) =>
      Promise.resolve({
        data: selected === "venue_id" ? [] : [],
        error: null,
      }).then(resolve);
    return builder;
  });
  return {
    client: { from, rpc } as unknown as SupabaseClient,
    from,
    rpc,
    writes,
    inserted,
  };
}

describe("recurring series materialization safety", () => {
  const beforeTonight = new Date("2026-08-28T10:00:00.000Z"); // 17:00 in Đà Lạt

  it("includes today's daily occurrence when its Đà Lạt start time is still upcoming", () => {
    const planned = planSeriesOccurrences(series(), 1, beforeTonight);

    expect(planned[0]).toMatchObject({
      date: "2026-08-28",
      startsAt: "2026-08-28T12:30:00.000Z",
      endsAt: "2026-08-28T14:30:00.000Z",
    });
  });

  it("does not recreate today's occurrence after its Đà Lạt start time", () => {
    const afterStart = new Date("2026-08-28T13:00:00.000Z"); // 20:00 in Đà Lạt
    const planned = planSeriesOccurrences(series(), 1, afterStart);

    expect(planned[0]?.date).toBe("2026-08-29");
  });

  it.each([
    ["missing", null],
    ["older than fourteen days", "2026-08-13T09:59:59.000Z"],
  ])(
    "does not query or publish an imported series whose confirmation is %s",
    async (_label, confirmedAt) => {
      const from = vi.fn();
      const count = await materializeSeriesOccurrences(
        { from } as unknown as SupabaseClient,
        series({ last_confirmed_at: confirmedAt }),
        1,
        { now: beforeTonight },
      );

      expect(count).toBe(0);
      expect(from).not.toHaveBeenCalled();
    },
  );

  it("keeps legacy series eligible without Activity Graph confirmation fields", async () => {
    const db = writeClient();
    const count = await materializeSeriesOccurrences(
      db.client,
      series({ source_platform: null, last_confirmed_at: null }),
      1,
      { now: beforeTonight, strict: true },
    );

    expect(count).toBeGreaterThan(0);
    expect(db.inserted[0]).toMatchObject({
      series_instance_date: "2026-08-28",
      starts_at: "2026-08-28T12:30:00.000Z",
      status: "published",
    });
    expect(db.inserted[0]).not.toHaveProperty("source_locale");
  });

  it("drafts graph top-ups before the atomic current-state publication gate", async () => {
    const db = writeClient();
    db.rpc.mockResolvedValueOnce({
      data: { published: true, count: 1 },
      error: null,
    });

    const count = await topUpSeriesOccurrences(
      db.client,
      series(),
      1,
      beforeTonight,
    );

    expect(count).toBeGreaterThan(0);
    expect(db.inserted[0]).toMatchObject({ status: "draft" });
    expect(db.rpc).toHaveBeenCalledWith(
      "publish_verified_activity_graph_series_occurrences",
      expect.objectContaining({
        p_series_id: "11111111-1111-4111-8111-111111111111",
        p_occurrence_dates: expect.arrayContaining(["2026-08-28"]),
        p_published_at: beforeTonight.toISOString(),
      }),
    );
  });

  it("leaves raced admin-suppressed graph top-ups private", async () => {
    const db = writeClient();
    db.rpc.mockResolvedValueOnce({
      data: { published: false, reason: "series_not_publishable" },
      error: null,
    });

    await expect(
      topUpSeriesOccurrences(db.client, series(), 1, beforeTonight),
    ).resolves.toBe(0);
    expect(db.inserted[0]).toMatchObject({ status: "draft" });
  });

  it("auto-pauses stale imported series and drafts future dates only", async () => {
    const db = writeClient();
    const stale = series({ last_confirmed_at: "2026-08-13T09:59:59.000Z" });

    expect(isFreshActivityGraphSeries(stale, beforeTonight)).toBe(false);
    await expect(
      pauseStaleActivityGraphSeries(db.client, stale, beforeTonight),
    ).resolves.toBe(true);

    expect(db.rpc).toHaveBeenCalledWith("pause_stale_activity_graph_series", {
      p_series_id: stale.id,
      p_paused_at: beforeTonight.toISOString(),
    });
    expect(db.writes).toEqual([]);
  });

  it("does not pause creator-managed legacy series", async () => {
    const db = writeClient();
    const legacy = series({ source_platform: null, last_confirmed_at: null });

    await expect(
      pauseStaleActivityGraphSeries(db.client, legacy, beforeTonight),
    ).resolves.toBe(false);
    expect(db.from).not.toHaveBeenCalled();
  });
});
