import { describe, expect, it, vi } from "vitest";
import {
  venueSearchLocales,
  venueSearchModifiedAt,
  fetchVenueSearchTranslations,
  fetchVenueSearchSources,
} from "./search-indexing";
import type { SupabaseClient } from "@supabase/supabase-js";

const venue = {
  id: "v",
  description: "An independent café in Đà Lạt.",
  source_locale: "en",
  updated_at: "2026-10-01T00:00:00Z",
};
const de = {
  content_id: "v",
  target_locale: "de",
  translated_text: "Ein unabhängiges Café in Đà Lạt.",
  updated_at: "2026-10-28T00:00:00Z",
};
describe("venue search coverage", () => {
  it("advertises source and actual translated prose, never an English fallback as German", () => {
    expect(venueSearchLocales(venue, [])).toEqual(["en"]);
    expect(venueSearchLocales(venue, [de])).toEqual(["en", "de"]);
    expect(
      venueSearchLocales(venue, [{ ...de, translated_text: " " }]),
    ).toEqual(["en"]);
    expect(venueSearchLocales({ ...venue, source_locale: "vi" }, [])).toEqual([
      "vi",
    ]);
    expect(venueSearchLocales({ ...venue, source_locale: "und" }, [])).toEqual(
      [],
    );
    expect(
      venueSearchLocales({ ...venue, description: null }, []),
    ).toHaveLength(12);
  });
  it("notifies crawlers of a new translation without fabricating a new source date", () => {
    expect(venueSearchLocales({ ...venue, source_locale: null }, [])).toEqual(
      [],
    );
    expect(venueSearchLocales({ ...venue, source_locale: null }, [de])).toEqual(
      ["de"],
    );
    expect(venueSearchModifiedAt(venue, "de", [de])).toBe(de.updated_at);
    expect(venueSearchModifiedAt(venue, "vi", [de])).toBe(venue.updated_at);
    expect(
      venueSearchModifiedAt(venue, "de", [{ ...de, updated_at: "invalid" }]),
    ).toBe(venue.updated_at);
  });
  it("includes source venues beyond the first thousand rows in stable order", async () => {
    const pages = [
      Array.from({ length: 1000 }, (_, i) => ({ ...venue, id: `venue-${i}` })),
      [{ ...venue, id: "venue-1000" }],
    ];
    const q: any = {
      select: vi.fn(() => q),
      order: vi.fn(() => q),
      range: vi.fn(async () => ({ data: pages.shift(), error: null })),
    };
    expect(
      await fetchVenueSearchSources({
        from: () => q,
      } as unknown as SupabaseClient),
    ).toHaveLength(1001);
    expect(q.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(q.range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
  it("pages beyond response caps and fails explicitly on an inaccessible translation table", async () => {
    const pages = [Array(1000).fill(de), [de]];
    const q: any = {
      select: vi.fn(() => q),
      eq: vi.fn(() => q),
      in: vi.fn(() => q),
      order: vi.fn(() => q),
      range: vi.fn(async () => ({ data: pages.shift(), error: null })),
    };
    const db = { from: vi.fn(() => q) } as unknown as SupabaseClient;
    expect(await fetchVenueSearchTranslations(db, ["v"])).toHaveLength(1001);
    expect(q.range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    q.range.mockResolvedValue({
      data: null,
      error: { message: "unavailable" },
    });
    await expect(fetchVenueSearchTranslations(db, ["v"])).rejects.toThrow(
      "unavailable",
    );
  });
});
