import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTENT_LOCALES } from "@/lib/types";
import type { ExtractedActivity } from "./types";
import {
  activityTranslationCellNeedsWrite,
  upsertActivityEventTranslations,
} from "./translations";

const translate = vi.hoisted(() => vi.fn());
const english = vi.hoisted(() => vi.fn());
vi.mock("@/lib/google-translate", () => ({
  batchTranslateFields: translate,
  translateFieldsToLocale: english,
}));

const VENUE = "Dưới Tán Anh Đào";

function translationDb(existing: Array<Record<string, unknown>> = []) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const db = {
    from: () => {
      const query: Record<string, unknown> = {};
      const chain = () => query;
      query.select = vi.fn(chain);
      query.eq = vi.fn(chain);
      query.in = vi.fn(chain);
      query.upsert = upsert;
      query.then = (
        resolve: (value: { data: unknown[]; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve({ data: existing, error: null }).then(resolve, reject);
      return query;
    },
  } as unknown as SupabaseClient;
  return { db, upsert };
}

function storedCopy(
  eventId: string,
  locale: string,
  field: "title" | "description",
  text: string,
  status = "auto",
) {
  return {
    content_id: eventId,
    target_locale: locale,
    field_name: field,
    translated_text: text,
    translation_status: status,
  };
}

beforeEach(() => {
  english.mockReset();
  translate.mockReset();
});

it("publishes actual translated titles and descriptions without fabricating failed locale coverage", async () => {
  english.mockResolvedValue({ title: "Mid-Autumn Festival", description: "A celebration for children and visitors." });
  translate.mockResolvedValue({ translations: { en: { title: "Mid-Autumn Festival", description: "A celebration for children and visitors." }, vi: { title: "Đêm hội Trung thu", description: "Đêm hội dành cho thiếu nhi." } } });
  const { db, upsert } = translationDb();
  await upsertActivityEventTranslations(db, ["event-1", "event-2"], { title: "Đêm hội Trung thu", description: "Đêm hội dành cho thiếu nhi." } as ExtractedActivity, "Publisher");
  const rows = upsert.mock.calls[0][0];
  expect(rows).toHaveLength(8);
  expect(rows.find((r: { target_locale: string; field_name: string }) => r.target_locale === "en" && r.field_name === "title").translated_text).toBe("Mid-Autumn Festival");
  expect(rows.some((r: { target_locale: string }) => r.target_locale === "fr")).toBe(false);
  expect(english.mock.calls[0][0][1].text).toBe("Đêm hội dành cho thiếu nhi.");
  expect(translate.mock.calls[0][1]).toBe("en");
});

it("blocks publication when the English fallback is unavailable", async () => {
  english.mockResolvedValue({ title: "Mid-Autumn Festival" });
  translate.mockResolvedValue({ translations: { vi: { title: "Đêm hội Trung thu" } } });
  const { db, upsert } = translationDb();
  await expect(upsertActivityEventTranslations(db, ["event-1"], { title: "Đêm hội Trung thu", description: "Đêm hội dành cho thiếu nhi." } as ExtractedActivity, "Publisher")).rejects.toThrow("English activity translation is incomplete");
  expect(upsert).not.toHaveBeenCalled();
});

it("does not overwrite non-blank translations when the source text is unchanged", async () => {
  const title = "Live Acoustic • Dưới Tán Anh Đào";
  const description = "Nhạc acoustic tại Dưới Tán Anh Đào.";
  const existing = ["event-1"].flatMap((eventId) =>
    CONTENT_LOCALES.flatMap((locale) => [
      storedCopy(eventId, locale, "title", locale === "vi" ? title : `${title} (${locale})`),
      storedCopy(
        eventId,
        locale,
        "description",
        locale === "vi" ? description : `Acoustic night at ${VENUE} (${locale})`,
      ),
    ]),
  );
  const { db, upsert } = translationDb(existing);
  await upsertActivityEventTranslations(
    db,
    ["event-1"],
    {
      title,
      description,
      locationName: VENUE,
    } as ExtractedActivity,
    VENUE,
  );
  expect(upsert).not.toHaveBeenCalled();
  expect(english).not.toHaveBeenCalled();
  expect(translate).not.toHaveBeenCalled();
});

it("keeps a venue name intact when repairing a translation that dropped it", async () => {
  const title = `Live Acoustic • ${VENUE}`;
  const description = `Nhạc acoustic tại ${VENUE}.`;
  const existing = CONTENT_LOCALES.flatMap((locale) => [
    storedCopy(
      "event-1",
      locale,
      "title",
      locale === "vi" ? title : "Live Acoustic • Under the Apricot Tree",
    ),
    storedCopy(
      "event-1",
      locale,
      "description",
      locale === "vi" ? description : "Live acoustic under the apricot tree.",
    ),
  ]);
  english.mockImplementation(async (fields: Array<{ field_name: string; text: string }>) => {
    const record = Object.fromEntries(fields.map((field) => [field.field_name, field.text]));
    expect(record.title).not.toContain(VENUE);
    expect(record.description).not.toContain(VENUE);
    expect(record.title).toContain("⟦");
    return record;
  });
  translate.mockImplementation(async (fields: Array<{ field_name: string; text: string }>) => {
    const record = Object.fromEntries(fields.map((field) => [field.field_name, field.text]));
    const translations = Object.fromEntries(
      CONTENT_LOCALES.map((locale) => [locale, record]),
    );
    return { translations };
  });
  const { db, upsert } = translationDb(existing);
  await upsertActivityEventTranslations(
    db,
    ["event-1"],
    { title, description, locationName: VENUE, organizerName: VENUE } as ExtractedActivity,
    VENUE,
  );
  const rows = upsert.mock.calls[0][0] as Array<{
    target_locale: string;
    field_name: string;
    translated_text: string;
  }>;
  const englishTitle = rows.find((row) => row.target_locale === "en" && row.field_name === "title");
  expect(englishTitle?.translated_text).toContain(VENUE);
  expect(englishTitle?.translated_text).not.toContain("Apricot");
  expect(rows.some((row) => row.translated_text.includes("Apricot"))).toBe(false);
});

it("rewrites automatic rows when the source title changes and leaves reviewed rows", () => {
  expect(activityTranslationCellNeedsWrite({
    sourceChanged: false,
    sourceText: "Đêm hội",
    existing: { translated_text: "Festival", translation_status: "auto" },
    properNames: [],
  })).toBe(false);
  expect(activityTranslationCellNeedsWrite({
    sourceChanged: true,
    sourceText: "Đêm hội mới",
    existing: { translated_text: "Festival", translation_status: "auto" },
    properNames: [],
  })).toBe(true);
  expect(activityTranslationCellNeedsWrite({
    sourceChanged: true,
    sourceText: "Đêm hội mới",
    existing: { translated_text: "Festival", translation_status: "reviewed" },
    properNames: [],
  })).toBe(false);
  expect(activityTranslationCellNeedsWrite({
    sourceChanged: false,
    sourceText: `Night at ${VENUE}`,
    existing: { translated_text: "Night at Under the Apricot Tree", translation_status: "auto" },
    properNames: [VENUE],
  })).toBe(true);
});
