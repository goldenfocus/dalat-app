import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/routing", () => ({
  locales: ["en", "vi", "ko", "zh", "ru", "fr", "ja", "ms", "th", "de", "es", "id"],
}));

import {
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
