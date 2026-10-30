import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LANGUAGE_PREFERENCES, LANGUAGE_CODES, languageChoices, languageDisplayName, languagePreferencesSchema } from "./languages";
import { locales } from "@/lib/i18n/locales";
const preferences = { speaks: [{ language: "fr", level: "native" }], learning: { language: "vi", level: "new" } };

describe("private language preferences", () => {
  it("starts with Vietnamese for a brand new learner but requires a spoken language", () => {
    expect(DEFAULT_LANGUAGE_PREFERENCES.learning).toEqual({ language: "vi", level: "new" });
    expect(languagePreferencesSchema.safeParse(DEFAULT_LANGUAGE_PREFERENCES).success).toBe(false);
    expect(languagePreferencesSchema.parse(preferences)).toEqual(preferences);
  });
  it("accepts eight distinct languages and rejects duplicates, excessive selections and native targets", () => {
    const speaks = LANGUAGE_CODES.slice(0, 8).map(language => ({ language, level: "fluent" }));
    expect(languagePreferencesSchema.safeParse({ ...preferences, speaks }).success).toBe(true);
    expect(languagePreferencesSchema.safeParse({ ...preferences, speaks: [...speaks, speaks[0]] }).success).toBe(false);
    expect(languagePreferencesSchema.safeParse({ ...preferences, speaks: [speaks[0], speaks[0]] }).success).toBe(false);
    expect(languagePreferencesSchema.safeParse({ ...preferences, learning: { language: "vi", level: "native" } }).success).toBe(false);
  });
  it("rejects unsupported languages, levels and account identifiers", () => {
    for (const speaks of [[{ language: "not-a-language", level: "native" }], [{ language: "en", level: "expert" }]])
      expect(languagePreferencesSchema.safeParse({ ...preferences, speaks }).success).toBe(false);
    expect(languagePreferencesSchema.safeParse({ ...preferences, user_id: "other-account" }).success).toBe(false);
    expect(languagePreferencesSchema.safeParse({ ...preferences, speaks: [{ ...preferences.speaks[0], email: "private" }] }).success).toBe(false);
  });
  it("searches the full catalog using localized, English and native names without accents", () => {
    expect(LANGUAGE_CODES.length).toBeGreaterThan(150);
    expect(languageChoices("fr", "vietnam").map(item => item.code)).toContain("vi");
    expect(languageChoices("en", "Tiếng Việt").map(item => item.code)).toContain("vi");
    expect(languageChoices("en", "tieng viet").map(item => item.code)).toContain("vi");
    expect(languageChoices("en", "日本語").map(item => item.code)).toContain("ja");
  });
  it.each(locales)("pins the requested languages and names every option in %s", locale => {
    const choices = languageChoices(locale);
    expect(choices.map(item => item.code).slice(0, 4)).toEqual(["en", "vi", "fr", "es"]);
    expect(choices).toHaveLength(LANGUAGE_CODES.length);
    for (const { code, label } of choices) {
      expect(label.trim()).not.toBe("");
      expect(label).not.toBe(code);
    }
    const remaining = choices.slice(4).map(item => item.label);
    expect(remaining).toEqual([...remaining].sort((a, b) => a.localeCompare(b, locale)));
  });
  it("keeps complete names and search when browser display-name data is missing", () => {
    const displayNames = vi.spyOn(Intl, "DisplayNames").mockImplementation(() => {
      throw new Error("Browser has no display-name data");
    });
    try {
      expect(languageChoices("en", "Afar").map(item => item.code)).toEqual(["aa"]);
      expect(languageDisplayName("ab", "en")).toBe("Abkhazian");
      expect(languageDisplayName("ae", "en")).toBe("Avestan");
      expect(languageDisplayName("en", "vi")).toBe("Tiếng Anh");
      expect(languageDisplayName("vi", "fr-CA")).toBe("vietnamien");
      expect(languageChoices("en", "tieng viet").map(item => item.code)).toContain("vi");
    } finally {
      displayNames.mockRestore();
    }
  });
});
