import { CONTENT_LOCALES, type ContentLocale } from "../../lib/types";

export type DetectedSourceLocale = ContentLocale | "und";
export const SOURCE_LOCALES: DetectedSourceLocale[] = [
  ...CONTENT_LOCALES,
  "und",
];
import {
  translationWorkState,
  type TranslationRowState,
} from "../../lib/translations/work-status";

export type SourceFields = Record<string, string>;
export type CoverageRow = TranslationRowState & {
  target_locale?: string;
  field_name?: string;
};
export type JsonSchema = Record<string, unknown>;

/** Translate the union needed by these locales, retaining the full snapshot separately. */
export function pendingTranslationFields(
  fields: SourceFields,
  locales: readonly string[],
  existing: readonly CoverageRow[],
  options: Parameters<typeof translationWorkState>[1] = {},
): SourceFields {
  return Object.fromEntries(
    Object.entries(fields).filter(([key]) =>
      locales.some(
        (locale) =>
          translationWorkState(
            existing.find(
              (row) => row.target_locale === locale && row.field_name === key,
            ),
            options,
          ) === "pending",
      ),
    ),
  );
}

/** A small language-only hint prevents metadata-only work from relabelling the record. */
export function sourceLanguageContext(
  snapshot: SourceFields,
  projected: SourceFields,
): SourceFields {
  const key = [
    "description",
    "text_content",
    "bio",
    "story_content",
    "narrative",
    "content",
    "lyrics",
    "help_offered",
    "help_wanted",
    "title",
  ].find((field) => snapshot[field]);
  return key && !(key in projected)
    ? { [key]: snapshot[key].slice(0, 320) }
    : {};
}

const object = (properties: Record<string, unknown>): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const locale = { type: "string", enum: SOURCE_LOCALES };
const fieldValues = (fields: SourceFields) =>
  object(
    Object.fromEntries(
      Object.keys(fields).map((key) => [key, { type: "string", minLength: 1 }]),
    ),
  );

/** Exact target keys stop valid JSON with omitted languages/record IDs before it is accepted. */
export function rowResponseSchema(
  fields: SourceFields,
  locales: readonly string[],
  review = false,
): JsonSchema {
  return object({
    source_locale: locale,
    translations: object(
      Object.fromEntries(
        locales.map((target) => [target, fieldValues(fields)]),
      ),
    ),
    ...(review
      ? {
          approved: { type: "boolean" },
          issues: { type: "array", items: { type: "string" } },
        }
      : {}),
  });
}
export function batchResponseSchema(
  records: Record<string, SourceFields>,
  locales: readonly string[],
  review = false,
): JsonSchema {
  const recordsSchema = object(
    Object.fromEntries(
      Object.entries(records).map(([id, fields]) => [id, fieldValues(fields)]),
    ),
  );
  return object({
    sources: object(
      Object.fromEntries(Object.keys(records).map((id) => [id, locale])),
    ),
    translations: object(
      Object.fromEntries(locales.map((target) => [target, recordsSchema])),
    ),
    ...(review
      ? {
          approved: { type: "boolean" },
          issues: { type: "array", items: { type: "string" } },
        }
      : {}),
  });
}

/** Metadata can mix English AI copy and speech in another language; no single source copy is valid. */
export function sourceLocaleTranslations(
  translations: Record<string, SourceFields>,
  table: string,
  source: string,
  fields: SourceFields,
  targets: readonly string[],
): Record<string, SourceFields> {
  return table !== "moment_metadata" && targets.includes(source)
    ? { ...translations, [source]: { ...fields } }
    : translations;
}
