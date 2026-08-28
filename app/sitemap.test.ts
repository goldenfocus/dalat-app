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

describe("sitemap recurring activity series", () => {
  let seriesQuery: QueryBuilder;

  beforeEach(() => {
    seriesQuery = queryResult([
      {
        slug: "friday-sunset-acoustic",
        updated_at: "2026-08-27T12:00:00.000Z",
      },
    ]);

    const from = vi.fn((table: string) => {
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
    expect(seriesEntry).toMatchObject({
      url: "https://dalat.app/series/friday-sunset-acoustic",
      changeFrequency: "weekly",
      priority: 0.75,
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
});
