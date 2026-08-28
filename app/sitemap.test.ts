import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MetadataRoute } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import sitemap, {
  assertSitemapLimits,
  estimateSitemapBytes,
  fetchAllEventIndexingTranslations,
  latestSitemapLastModified,
  localizedEntries,
} from "./sitemap";

type QueryBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
};

function queryResult(data: unknown[]): QueryBuilder {
  const builder = {} as QueryBuilder;
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.range = vi.fn(async () => ({ data, error: null }));
  builder.then = (resolve) =>
    Promise.resolve({ data, error: null }).then(resolve);
  return builder;
}

function indexableEvent(
  slug: string,
  imageUrl: string | null,
  updatedAt: string,
) {
  return {
    id: `${slug}-id`,
    slug,
    title: `A complete guide to ${slug}`,
    description:
      "A complete event guide with confirmed programme details, venue information, transport guidance, accessibility notes, and practical advice for visitors.",
    starts_at: "2026-12-19T12:00:00.000Z",
    ends_at: "2026-12-31T15:00:00.000Z",
    location_name: "Lâm Viên Square",
    address: "Trần Quốc Toản Street, Đà Lạt",
    venue_id: null,
    is_online: false,
    online_link: null,
    image_url: imageUrl,
    tribe_id: null,
    tribe_visibility: "public",
    source_locale: "en",
    status: "published",
    updated_at: updatedAt,
  };
}

describe("localizedEntries", () => {
  it("emits one unique canonical loc for every supported locale", () => {
    const image = "https://dalat.app/activity-art/events/flower.png";
    const entries = localizedEntries("/events/da-lat-flower-festival-2026", {
      images: [image],
    });

    expect(entries).toHaveLength(12);
    expect(entries.map((item) => item.url)).toEqual([
      "https://dalat.app/events/da-lat-flower-festival-2026",
      "https://dalat.app/vi/events/da-lat-flower-festival-2026",
      "https://dalat.app/ko/events/da-lat-flower-festival-2026",
      "https://dalat.app/zh/events/da-lat-flower-festival-2026",
      "https://dalat.app/ru/events/da-lat-flower-festival-2026",
      "https://dalat.app/fr/events/da-lat-flower-festival-2026",
      "https://dalat.app/ja/events/da-lat-flower-festival-2026",
      "https://dalat.app/ms/events/da-lat-flower-festival-2026",
      "https://dalat.app/th/events/da-lat-flower-festival-2026",
      "https://dalat.app/de/events/da-lat-flower-festival-2026",
      "https://dalat.app/es/events/da-lat-flower-festival-2026",
      "https://dalat.app/id/events/da-lat-flower-festival-2026",
    ]);
    expect(new Set(entries.map((item) => item.url))).toHaveLength(12);
    expect(entries.every((item) => item.alternates === undefined)).toBe(true);
    expect(entries.every((item) => item.images?.[0] === image)).toBe(true);
  });

  it("uses the unprefixed homepage only for English", () => {
    const entries = localizedEntries("");
    expect(entries[0].url).toBe("https://dalat.app");
    expect(entries[1].url).toBe("https://dalat.app/vi");
  });
});

describe("sitemap event and recurring activity images", () => {
  let eventsQuery: QueryBuilder;
  let seriesQuery: QueryBuilder;

  beforeEach(() => {
    eventsQuery = queryResult([
      indexableEvent(
        "ha-nhi-da-lat",
        "https://dalat.app/activity-art/events/ha-nhi-da-lat.png#preview",
        "2026-08-27T13:00:00.000Z",
      ),
      indexableEvent(
        "event-without-an-image",
        null,
        "2026-08-27T11:00:00.000Z",
      ),
      indexableEvent(
        "event-with-invalid-image",
        "javascript:alert(1)",
        "2026-08-27T10:00:00.000Z",
      ),
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

  it("includes active series with fact art in every canonical locale", async () => {
    const entries = await sitemap();
    const seriesEntries = entries.filter((item) =>
      item.url.endsWith("/series/friday-sunset-acoustic"),
    );

    expect(seriesQuery.eq).toHaveBeenCalledWith("status", "active");
    expect(seriesQuery.select).toHaveBeenCalledWith(
      "slug, updated_at, image_url",
    );
    expect(seriesEntries).toHaveLength(12);
    expect(seriesEntries.map((item) => item.url)).toContain(
      "https://dalat.app/series/friday-sunset-acoustic",
    );
    expect(seriesEntries.map((item) => item.url)).toContain(
      "https://dalat.app/vi/series/friday-sunset-acoustic",
    );
    expect(
      seriesEntries.every(
        (item) =>
          item.changeFrequency === "weekly" &&
          item.priority === 0.75 &&
          item.alternates === undefined &&
          item.images?.[0] ===
            "https://dalat.app/activity-art/series/friday-sunset-acoustic.png",
      ),
    ).toBe(true);
  });

  it("adds a sanitized image to each ready event canonical", async () => {
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
      "id, slug, title, description, starts_at, ends_at, location_name, address, venue_id, is_online, online_link, image_url, tribe_id, tribe_visibility, source_locale, status, updated_at",
    );
    expect(eventEntries).toHaveLength(1);
    expect(eventEntries[0]).toMatchObject({
      url: "https://dalat.app/events/ha-nhi-da-lat",
      images: ["https://dalat.app/activity-art/events/ha-nhi-da-lat.png"],
    });
    expect(eventEntries[0]).not.toHaveProperty("alternates");
    expect(eventWithoutImage).not.toHaveProperty("images");
    expect(eventWithInvalidImage).not.toHaveProperty("images");
  });

  it("publishes both Flower Festival routes in all 12 locales", async () => {
    const entries = await sitemap();
    const overview = entries.filter((item) =>
      item.url.endsWith("/festivals/da-lat-flower-festival"),
    );
    const edition = entries.filter((item) =>
      item.url.endsWith("/festivals/da-lat-flower-festival/2026"),
    );

    expect(overview).toHaveLength(12);
    expect(edition).toHaveLength(12);
    expect([...overview, ...edition].every((item) => !item.alternates)).toBe(
      true,
    );
  });
});

describe("sitemap limits", () => {
  it("keeps a representative image-bearing locale cluster below 50 MB", () => {
    const entries = localizedEntries("/events/da-lat-flower-festival-2026", {
      images: ["https://dalat.app/activity-art/events/flower.png"],
    });
    expect(estimateSitemapBytes(entries)).toBeLessThan(50 * 1024 * 1024);
    expect(() => assertSitemapLimits(entries)).not.toThrow();
  });

  it("fails closed above Google's 50,000 loc limit", () => {
    const item: MetadataRoute.Sitemap[number] = {
      url: "https://dalat.app/event",
    };
    const entries = Array.from({ length: 50_001 }, () => item);
    expect(() => assertSitemapLimits(entries)).toThrow(/50001 URLs exceed/);
  });
});

describe("latestSitemapLastModified", () => {
  it("refreshes only the locale whose translation changed", () => {
    const sourceUpdatedAt = "2026-08-27T10:00:00.000Z";

    expect(latestSitemapLastModified(sourceUpdatedAt, null).toISOString()).toBe(
      sourceUpdatedAt,
    );
    expect(
      latestSitemapLastModified(
        sourceUpdatedAt,
        "2026-08-28T10:00:00.000Z",
      ).toISOString(),
    ).toBe("2026-08-28T10:00:00.000Z");
    expect(
      latestSitemapLastModified(
        sourceUpdatedAt,
        "2026-08-26T10:00:00.000Z",
      ).toISOString(),
    ).toBe(sourceUpdatedAt);
  });
});

describe("fetchAllEventIndexingTranslations", () => {
  it("pages beyond PostgREST's 1,000-row response cap", async () => {
    const row = {
      content_id: "event-id",
      target_locale: "vi",
      field_name: "title",
      translated_text: "Lễ hội hoa",
      updated_at: "2026-08-27T00:00:00.000Z",
    };
    const range = vi.fn(async (from: number) => ({
      data: from === 0 ? Array.from({ length: 1_000 }, () => row) : [row],
      error: null,
    }));
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      range,
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.order.mockReturnValue(query);
    const supabase = {
      from: vi.fn(() => query),
    } as unknown as SupabaseClient;

    const rows = await fetchAllEventIndexingTranslations(supabase, [
      "event-id",
    ]);

    expect(rows).toHaveLength(1_001);
    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(2, 1_000, 1_999);
  });
});
