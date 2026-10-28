import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE_PREFERENCES, LANGUAGE_CODES, languageChoices, languagePreferencesSchema } from "./languages";
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
});
