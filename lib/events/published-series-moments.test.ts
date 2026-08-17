import { describe, expect, it, vi } from "vitest";
import {
  fetchPublishedSeriesMoments,
  normalizeMomentMediaType,
} from "./published-series-moments";

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

function makeBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "lt", "order", "in", "not", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (
    resolve: (value: QueryResult) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

type TestClient = NonNullable<Parameters<typeof fetchPublishedSeriesMoments>[1]>;

function makeClient(eventsResult: QueryResult, momentsResult: QueryResult) {
  const events = makeBuilder(eventsResult);
  const moments = makeBuilder(momentsResult);
  const client = {
    from: vi.fn((table: string) => table === "events" ? events : moments),
  } as unknown as TestClient;
  return { client, events, moments };
}

describe("normalizeMomentMediaType", () => {
  it("maps the moments schema's photo type to the image renderer", () => {
    expect(normalizeMomentMediaType("photo")).toBe("image");
    expect(normalizeMomentMediaType("image")).toBe("image");
    expect(normalizeMomentMediaType("video")).toBe("video");
  });
});

describe("fetchPublishedSeriesMoments", () => {
  it("uses the real moments schema and returns published past-event photos", async () => {
    const { client, events, moments } = makeClient(
      {
        data: [{
          id: "past-event",
          slug: "tech-meetup-july",
          title: "Tech Meetup July",
          starts_at: "2026-07-22T03:00:00.000Z",
        }],
        error: null,
      },
      {
        data: [{
          id: "moment-1",
          media_url: "https://cdn.dalat.app/moments/moment-1.jpg",
          content_type: "photo",
          thumbnail_url: null,
          youtube_video_id: null,
          text_content: null,
          event_id: "past-event",
          moment_metadata: { quality_score: 0.9 },
        }],
        error: null,
      }
    );

    const result = await fetchPublishedSeriesMoments({
      seriesId: "series-1",
      currentEventId: "current-event",
      now: new Date("2026-08-16T12:00:00.000Z"),
    }, client);

    expect(events.eq).toHaveBeenCalledWith("series_id", "series-1");
    expect(events.eq).toHaveBeenCalledWith("status", "published");
    expect(events.neq).toHaveBeenCalledWith("id", "current-event");
    expect(events.lt).toHaveBeenCalledWith("starts_at", "2026-08-16T12:00:00.000Z");

    const select = vi.mocked(moments.select as (columns: string) => unknown);
    expect(select).toHaveBeenCalledWith(expect.stringContaining("content_type"));
    expect(select).not.toHaveBeenCalledWith(expect.stringContaining("media_type"));
    expect(moments.eq).toHaveBeenCalledWith("status", "published");
    expect(moments.limit).toHaveBeenCalledWith(120);

    expect(result).toEqual([expect.objectContaining({
      id: "moment-1",
      media_type: "image",
      event_slug: "tech-meetup-july",
    })]);
  });

  it("throws query failures so the UI cannot mislabel them as no media", async () => {
    const { client } = makeClient(
      {
        data: [{
          id: "past-event",
          slug: "past",
          title: "Past",
          starts_at: "2026-07-22T03:00:00.000Z",
        }],
        error: null,
      },
      { data: null, error: { message: "column moments.media_type does not exist" } }
    );

    await expect(fetchPublishedSeriesMoments({
      seriesId: "series-1",
      currentEventId: "current-event",
    }, client)).rejects.toThrow("Failed to load published series moments");
  });
});
