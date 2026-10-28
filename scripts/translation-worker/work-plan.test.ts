import { describe, expect, it } from "vitest";
import { CONTENT_LOCALES } from "../../lib/types";
import {
  batchResponseSchema,
  pendingTranslationFields,
  rowResponseSchema,
  sourceLanguageContext,
  sourceLocaleTranslations,
  SOURCE_LOCALES,
} from "./work-plan";

const ready = (target_locale: string, field_name: string) => ({
  target_locale,
  field_name,
  translated_text: "Reviewed",
  translation_status: "auto",
  ai_reviewed_at: "2026-10-28T00:00:00Z",
});
describe("translation request planning", () => {
  it("omits completed prose and human-owned fields but retains the full immutable source snapshot", () => {
    const snapshot = Object.freeze({
      description: "The full source description",
      photos: '[{"caption":"A view"}]',
      tags: '["coffee"]',
    });
    const existing = [
      ready("de", "description"),
      ready("fr", "description"),
      ready("de", "tags"),
      {
        ...ready("fr", "tags"),
        translation_status: "reviewed",
        is_stale: true,
      },
    ];
    const pending = pendingTranslationFields(snapshot, ["de", "fr"], existing);
    expect(pending).toEqual({ photos: snapshot.photos });
    expect(snapshot.description).toBe("The full source description");
    expect(Object.keys(snapshot)).toEqual(["description", "photos", "tags"]);
  });
  it("projects the locale-group union, excluding fields completed in that group", () => {
    const snapshot = { title: "Title", description: "Description" };
    const existing = [ready("de", "title"), ready("fr", "description")];
    expect(pendingTranslationFields(snapshot, ["de", "fr"], existing)).toEqual(
      snapshot,
    );
    expect(pendingTranslationFields(snapshot, ["de"], existing)).toEqual({
      description: "Description",
    });
    expect(pendingTranslationFields(snapshot, ["fr"], existing)).toEqual({
      title: "Title",
    });
  });
  it("keeps force review and human ownership semantics", () => {
    const existing = [
      ready("de", "title"),
      { ...ready("de", "description"), translation_status: "edited" },
    ];
    expect(
      pendingTranslationFields(
        { title: "Title", description: "Description" },
        ["de"],
        existing,
        { force: true },
      ),
    ).toEqual({ title: "Title" });
  });
  it("caps language-only context without adding completed prose to translation targets", () => {
    const snapshot = {
      description: "Vietnamese source context ".repeat(100),
      tags: '["coffee"]',
    };
    const projected = { tags: snapshot.tags };
    expect(sourceLanguageContext(snapshot, projected)).toEqual({
      description: snapshot.description.slice(0, 320),
    });
    expect(sourceLanguageContext(snapshot, snapshot)).toEqual({});
    expect(projected).toEqual({ tags: '["coffee"]' });
  });
  it("requires every target locale, source label, record UUID and projected field in schemas without placing source prose in argv", () => {
    const id1 = "fa4d0ee2-6874-4f4e-b84c-aa6cdb5233da",
      id2 = "9fd016de-d590-455d-82bb-80752b1134b4";
    const schema: any = batchResponseSchema(
      {
        [id1]: { description: "Sensitive original prose" },
        [id2]: { tags: "[]" },
      },
      CONTENT_LOCALES,
      true,
    );
    expect(schema.properties.translations.required).toEqual(CONTENT_LOCALES);
    expect(schema.properties.sources.required).toEqual([id1, id2]);
    expect(schema.properties.sources.properties[id1].enum).toEqual(
      SOURCE_LOCALES,
    );
    expect(schema.properties.translations.properties.zh.required).toEqual([
      id1,
      id2,
    ]);
    expect(
      schema.properties.translations.properties.zh.properties[id2].required,
    ).toEqual(["tags"]);
    expect(schema.required).toContain("approved");
    expect(JSON.stringify(schema)).not.toContain("Sensitive original prose");
    const single: any = rowResponseSchema({ photos: "[]" }, ["zh", "de"]);
    expect(single.properties.translations.required).toEqual(["zh", "de"]);
    expect(
      single.properties.translations.properties.zh.additionalProperties,
    ).toBe(false);
    expect(single.required).toContain("source_locale");
  });
});

it("preserves monolingual authored originals without copying mixed-language metadata wholesale", () => {
  const authored = { description: "Byte-exact source\nwith original spacing." };
  expect(
    sourceLocaleTranslations(
      { en: { description: "Rewritten" } },
      "venues",
      "en",
      authored,
      ["en"],
    ),
  ).toEqual({ en: authored });
  const metadata = {
    ai_description: "A coffee shop",
    video_transcript: "Xin chào",
  };
  const translated = {
    vi: { ai_description: "Một quán cà phê", video_transcript: "Xin chào" },
    en: { ai_description: "A coffee shop", video_transcript: "Hello" },
  };
  expect(
    sourceLocaleTranslations(translated, "moment_metadata", "vi", metadata, [
      "vi",
      "en",
    ]),
  ).toEqual(translated);
  expect(
    sourceLocaleTranslations(translated, "moment_metadata", "en", metadata, [
      "vi",
      "en",
    ]),
  ).toEqual(translated);
  expect(metadata.video_transcript).toBe("Xin chào");
});

it("translates unsupported source languages into English instead of copying them into the English target", () => {
  const source = { content: "Dzień dobry, czy mogę prosić o kawę?" };
  const translations = {
    en: { content: "Hello, could I have a coffee, please?" },
  };
  expect(
    sourceLocaleTranslations(translations, "comments", "und", source, ["en"]),
  ).toEqual(translations);
  const schema: any = rowResponseSchema(source, CONTENT_LOCALES);
  expect(schema.properties.source_locale.enum).toContain("und");
  expect(schema.properties.translations.required).toEqual(CONTENT_LOCALES);
  expect(schema.properties.translations.required).not.toContain("und");
});
