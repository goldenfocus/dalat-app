import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/routing", () => ({
  locales: ["en", "vi", "ko", "zh", "ru", "fr", "ja", "ms", "th", "de", "es", "id"],
}));

import {
  generateMomentMetadata,
  buildAlternates,
  localeUrl,
  resolveEventIndexableLocales,
} from "./metadata";

describe("localized metadata URLs", () => {
  it("keeps the default locale unprefixed", () => {
    expect(localeUrl("en", "/events/coffee-night")).toBe(
      "https://dalat.app/events/coffee-night"
    );
    expect(localeUrl("vi", "/events/coffee-night")).toBe(
      "https://dalat.app/vi/events/coffee-night"
    );
  });

  it("limits hreflang to locale versions that are ready to index", () => {
    expect(
      buildAlternates("fr", "/events/coffee-night", ["vi", "fr"])
    ).toEqual({
      canonical: "https://dalat.app/fr/events/coffee-night",
      languages: {
        vi: "https://dalat.app/vi/events/coffee-night",
        fr: "https://dalat.app/fr/events/coffee-night",
        "x-default": "https://dalat.app/vi/events/coffee-night",
      },
    });
  });

  it("does not advertise x-default or hreflang when no locale is indexable", () => {
    expect(buildAlternates("fr", "/events/coffee-night", [])).toEqual({
      canonical: "https://dalat.app/fr/events/coffee-night",
    });
  });

  it("keeps a successful zero-ready result empty and falls back only on query failure", () => {
    expect(resolveEventIndexableLocales([], "vi", false)).toEqual([]);
    expect(resolveEventIndexableLocales(null, "vi", false)).toEqual([]);
    expect(resolveEventIndexableLocales([], "vi", true)).toEqual(["vi"]);
    expect(resolveEventIndexableLocales([], "unsupported", true)).toEqual(["en"]);
  });
});


describe("localized moment previews", () => {
  it("uses localized title and empty-caption fallback throughout social metadata", () => {
    const metadata = generateMomentMetadata({
      id: "moment", created_at: "2026-10-21T00:00:00Z", text_content: null,
      media_url: null, content_type: "photo", user_id: "author",
      profiles: { display_name: "Slaven", username: "slaven" },
      events: { title: "Sprachaustausch", slug: "language-exchange" },
    }, "de", {
      title: "Ein Moment von Slaven beim Sprachaustausch",
      fallbackDescription: "Slaven hat einen Moment beim Sprachaustausch geteilt.",
    });
    expect(metadata.title).toBe("Ein Moment von Slaven beim Sprachaustausch | ĐàLạt.app");
    expect(metadata.description).toBe("Slaven hat einen Moment beim Sprachaustausch geteilt.");
    expect(metadata.openGraph?.title).toBe("Ein Moment von Slaven beim Sprachaustausch");
    expect(metadata.twitter?.description).toBe(metadata.description);
    expect(metadata.alternates?.canonical).toBe("https://dalat.app/de/events/language-exchange/moments/moment");
  });
});


it("retains short localized captions instead of replacing them with English SEO filler", () => {
  const metadata = generateMomentMetadata({
    id: "moment", created_at: "2026-10-21T00:00:00Z", text_content: "Ein schöner Abend!",
    media_url: null, content_type: "photo", user_id: "author",
    events: { title: "Sprachaustausch", slug: "exchange" },
  }, "de", { title: "Ein Moment", fallbackDescription: "Ein geteilter Moment." });
  expect(metadata.description).toBe("Ein schöner Abend!");
  expect(metadata.openGraph?.description).toBe("Ein schöner Abend!");
});


it("does not append English SEO suffixes to longer localized captions", () => {
  const caption = "Ein gemeinsamer Abend mit Gesprächen, Musik und neuen Freunden.";
  const metadata = generateMomentMetadata({
    id: "moment", created_at: "2026-10-21T00:00:00Z", text_content: caption,
    media_url: null, content_type: "photo", user_id: "author",
    events: { title: "Sprachaustausch", slug: "exchange" },
  }, "de", { title: "Ein Moment", fallbackDescription: "Ein geteilter Moment." });
  expect(metadata.description).toBe(caption);
});
