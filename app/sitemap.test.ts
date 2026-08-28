import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import sitemap from "./sitemap";

type QueryBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
};

function queryResult(data: unknown[]): QueryBuilder {
  const builder = {} as QueryBuilder;
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.then = (resolve) =>
    Promise.resolve({ data, error: null }).then(resolve);
  return builder;
}

describe("sitemap event and recurring activity images", () => {
  let eventsQuery: QueryBuilder;
  let seriesQuery: QueryBuilder;

  beforeEach(() => {
    eventsQuery = queryResult([
      {
        slug: "ha-nhi-da-lat",
        updated_at: "2026-08-27T13:00:00.000Z",
        image_url:
          "https://dalat.app/activity-art/events/ha-nhi-da-lat.png#preview",
      },
      {
        slug: "event-without-an-image",
        updated_at: "2026-08-27T11:00:00.000Z",
        image_url: null,
      },
      {
        slug: "event-with-invalid-image",
        updated_at: "2026-08-27T10:00:00.000Z",
        image_url: "javascript:alert(1)",
      },
    ]);
    seriesQuery = queryResult([
      {
        slug: "friday-sunset-acoustic",
        updated_at: "2026-08-27T12:00:00.000Z",
        image_url:
          "https://dalat.app/activity-art/series/friday-sunset-acoustic.png",
      },
    ]);

    const from = vi.fn((table: string) => {
      if (table === "events") return eventsQuery;
      if (table === "event_series") return seriesQuery;
      return queryResult([]);
    });

    mocks.createClient.mockReset().mockResolvedValue({
      from,
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
  });

  it("includes only active series with localized canonical alternates", async () => {
    const entries = await sitemap();
    const seriesEntry = entries.find(
      (item) => item.url === "https://dalat.app/series/friday-sunset-acoustic",
    );

    expect(seriesQuery.eq).toHaveBeenCalledWith("status", "active");
    expect(seriesQuery.select).toHaveBeenCalledWith(
      "slug, updated_at, image_url",
    );
    expect(seriesEntry).toMatchObject({
      url: "https://dalat.app/series/friday-sunset-acoustic",
      changeFrequency: "weekly",
      priority: 0.75,
      images: [
        "https://dalat.app/activity-art/series/friday-sunset-acoustic.png",
      ],
      alternates: {
        languages: {
          en: "https://dalat.app/series/friday-sunset-acoustic",
          vi: "https://dalat.app/vi/series/friday-sunset-acoustic",
          ko: "https://dalat.app/ko/series/friday-sunset-acoustic",
          "x-default": "https://dalat.app/series/friday-sunset-acoustic",
        },
      },
    });
  });

  it("adds one image declaration to each published canonical event entry", async () => {
    const entries = await sitemap();
    const eventEntries = entries.filter((item) =>
      item.url.includes("/events/ha-nhi-da-lat"),
    );
    const eventWithoutImage = entries.find(
      (item) => item.url === "https://dalat.app/events/event-without-an-image",
    );
    const eventWithInvalidImage = entries.find(
      (item) =>
        item.url === "https://dalat.app/events/event-with-invalid-image",
    );

    expect(eventsQuery.eq).toHaveBeenCalledWith("status", "published");
    expect(eventsQuery.select).toHaveBeenCalledWith(
      "slug, updated_at, image_url",
    );
    expect(eventEntries).toHaveLength(1);
    expect(eventEntries[0]).toMatchObject({
      url: "https://dalat.app/events/ha-nhi-da-lat",
      images: ["https://dalat.app/activity-art/events/ha-nhi-da-lat.png"],
      alternates: {
        languages: {
          en: "https://dalat.app/events/ha-nhi-da-lat",
          vi: "https://dalat.app/vi/events/ha-nhi-da-lat",
          "x-default": "https://dalat.app/events/ha-nhi-da-lat",
        },
      },
    });
    expect(eventWithoutImage).not.toHaveProperty("images");
    expect(eventWithInvalidImage).not.toHaveProperty("images");
  });
});
