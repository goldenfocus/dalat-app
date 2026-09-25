import { describe, expect, it, vi } from "vitest";
import { CONTENT_LOCALES } from "@/lib/types";
import {
  eventTranslationFields,
  eventTranslationQueueClears,
  eventTranslationWindowStart,
  nonSourceEventLocales,
  planEventLocaleWrites,
  selectEventTranslationBatch,
  sweepPublishedEventTranslations,
  type StoredEventTranslation,
} from "./event-translation";

const now = new Date("2026-09-25T10:00:00.000Z");

const fields = eventTranslationFields({
  title: "Đêm nhạc tại Đà Lạt",
  description: "Canonical facts from the organizer page.",
});

function filledLocales(locales: readonly string[]): StoredEventTranslation[] {
  return locales.flatMap((locale) =>
    fields.map((field) => ({
      target_locale: locale,
      field_name: field.field_name,
      translated_text: `${field.field_name}:${locale}`,
    })),
  );
}

describe("event translation locale plan", () => {
  it("asks only for non-source locales", () => {
    expect(nonSourceEventLocales("vi")).toEqual(
      CONTENT_LOCALES.filter((locale) => locale !== "vi"),
    );
    expect(nonSourceEventLocales("vi")).not.toContain("vi");
    expect(nonSourceEventLocales(null)).toEqual(CONTENT_LOCALES);
  });

  it("plans only missing fields and is empty once they are stored", () => {
    const existing = filledLocales(CONTENT_LOCALES.filter((locale) => locale !== "vi"));
    expect(planEventLocaleWrites({ sourceLocale: "vi", fields }, existing)).toEqual([]);

    const partial = existing.filter(
      (row) => !(row.target_locale === "ja" && row.field_name === "description"),
    );
    expect(planEventLocaleWrites({ sourceLocale: "vi", fields }, partial)).toEqual([
      {
        locale: "ja",
        fields: [{ field_name: "description", text: fields[1].text }],
      },
    ]);

    const filled = [
      ...partial,
      {
        target_locale: "ja",
        field_name: "description",
        translated_text: "主催者ページの事実",
      },
    ];
    expect(planEventLocaleWrites({ sourceLocale: "vi", fields }, filled)).toEqual([]);
  });

  it("ignores blank rows and does not treat them as done", () => {
    const rows = filledLocales(["en"]).map((row) =>
      row.field_name === "title" ? { ...row, translated_text: "   " } : row,
    );
    const plan = planEventLocaleWrites({ sourceLocale: "vi", fields }, rows);
    expect(plan.find((item) => item.locale === "en")?.fields.map((field) => field.field_name)).toEqual([
      "title",
    ]);
  });

  it("clears the queue only when the source locale is known and nothing is missing", () => {
    expect(eventTranslationQueueClears({
      sourceLocale: "vi",
      planned: [],
    })).toBe(true);
    expect(eventTranslationQueueClears({
      sourceLocale: null,
      planned: [],
    })).toBe(false);
    expect(eventTranslationQueueClears({
      sourceLocale: "vi",
      planned: [{ locale: "en", fields }],
    })).toBe(false);
  });
});

describe("event translation sweep selection", () => {
  const tonight = "2026-09-25T13:00:00.000Z";
  const thisMorning = "2026-09-25T01:00:00.000Z";
  const nextMonth = "2026-10-20T12:00:00.000Z";
  const yesterday = "2026-09-24T13:00:00.000Z";
  const ancient = "2026-01-01T12:00:00.000Z";

  it("starts the Đà Lạt day at local midnight", () => {
    expect(eventTranslationWindowStart(now).toISOString()).toBe("2026-09-24T17:00:00.000Z");
  });

  it("puts the soonest start first and keeps older flagged rows behind today", () => {
    const selected = selectEventTranslationBatch(
      [
        { id: "ancient", startsAt: ancient, translationNeededAt: "2026-01-01T00:00:00.000Z" },
        { id: "next-month", startsAt: nextMonth, translationNeededAt: null },
        { id: "tonight", startsAt: tonight, translationNeededAt: "2026-09-25T09:00:00.000Z" },
        { id: "morning", startsAt: thisMorning, translationNeededAt: null },
        { id: "yesterday", startsAt: yesterday, translationNeededAt: "2026-09-24T00:00:00.000Z" },
        { id: "old-unflagged", startsAt: ancient, translationNeededAt: null },
      ],
      now,
      10,
    );

    expect(selected.map((row) => row.id)).toEqual([
      "morning",
      "tonight",
      "next-month",
      "yesterday",
      "ancient",
    ]);
  });

  it("bounds the batch so a later event waits", () => {
    const selected = selectEventTranslationBatch(
      [
        { id: "tonight", startsAt: tonight, translationNeededAt: "2026-09-25T09:00:00.000Z" },
        { id: "next-month", startsAt: nextMonth, translationNeededAt: "2026-09-01T00:00:00.000Z" },
      ],
      now,
      1,
    );
    expect(selected.map((row) => row.id)).toEqual(["tonight"]);
  });

  it("keeps a same-day event that has already started ahead of next month", () => {
    const selected = selectEventTranslationBatch(
      [
        { id: "next-month", startsAt: nextMonth, translationNeededAt: "2026-09-01T00:00:00.000Z" },
        { id: "morning", startsAt: thisMorning, translationNeededAt: "2026-09-25T02:00:00.000Z" },
      ],
      now,
      2,
    );
    expect(selected.map((row) => row.id)).toEqual(["morning", "next-month"]);
  });

  it("never reads blog or moment tables", async () => {
    const tables: string[] = [];
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const method of ["select", "eq", "not", "order", "limit", "gte", "in", "range"]) {
      builder[method] = vi.fn(chain);
    }
    builder.then = (
      resolve: (value: { data: unknown[]; error: null }) => unknown,
    ) => Promise.resolve({ data: [], error: null }).then(resolve);
    const supabase = {
      from: (table: string) => {
        tables.push(table);
        return builder;
      },
    };

    const result = await sweepPublishedEventTranslations(supabase as never, {
      now,
      limit: 3,
    });

    expect(result).toEqual({
      scanned: 0,
      selected: [],
      clearedWithoutWork: 0,
      results: [],
    });
    expect(tables).toEqual(["events", "events"]);
  });
});
