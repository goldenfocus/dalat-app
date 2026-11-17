import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: [] as Array<Record<string, string>>, locales: [] as string[] }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createStaticClient: () => ({
    from: () => {
      let locale = "";
      const query: any = {
        select: () => query,
        eq: (column: string, value: string) => {
          if (column === "target_locale") { locale = value; mocks.locales.push(value); }
          return query;
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({
          data: mocks.rows.filter((row) => row.target_locale === locale),
        }).then(resolve),
      };
      return query;
    },
  }),
}));

import { getTranslationsWithFallback } from "./translations";

beforeEach(() => { mocks.rows = []; mocks.locales = []; });

describe("mixed-language event fields", () => {
  it("uses a translated title with original prose in the dominant source language", async () => {
    mocks.rows = [
      { target_locale: "vi", field_name: "title", translated_text: "Tiệc góp món bên hồ" },
      { target_locale: "en", field_name: "description", translated_text: "Walk around the lake" },
    ];
    expect(await getTranslationsWithFallback("event", "event-1", "vi", {
      title: "Potluck around the lake", description: "Đi bộ quanh hồ",
    }, undefined, "vi")).toEqual({ title: "Tiệc góp món bên hồ", description: "Đi bộ quanh hồ" });
    expect(mocks.locales).toEqual(["vi"]);
  });

  it("renders reviewed English prose even when the old source label says English", async () => {
    mocks.rows = [{ target_locale: "en", field_name: "description", translated_text: "Walk around the lake" }];
    expect(await getTranslationsWithFallback("event", "event-1", "en", {
      title: "Potluck around the lake", description: "Đi bộ quanh hồ",
    }, undefined, "en")).toEqual({ title: "Potluck around the lake", description: "Walk around the lake" });
  });

  it("loads an English fallback once for all missing fields", async () => {
    mocks.rows = [
      { target_locale: "en", field_name: "title", translated_text: "Potluck around the lake" },
      { target_locale: "en", field_name: "description", translated_text: "Walk around the lake" },
    ];
    expect(await getTranslationsWithFallback("event", "event-1", "fr", {
      title: "Tiệc góp món", description: "Đi bộ quanh hồ", image_alt: null,
    }, undefined, "vi")).toEqual({ title: "Potluck around the lake", description: "Walk around the lake", image_alt: null });
    expect(mocks.locales).toEqual(["fr", "en"]);
  });
});
