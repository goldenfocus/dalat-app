import { describe, expect, it, vi } from "vitest";
import { CONTENT_LOCALES } from "@/lib/types";
import { translationNeededAtColumn } from "@/lib/translation-sweep";
import {
  eventTranslationFields,
  eventTranslationQueueClears,
  eventTranslationWindowStart,
  nonSourceEventLocales,
  planEventLocaleWrites,
  selectEventTranslationBatch,
  sweepPublishedEventTranslations,
  withEventTranslationStamp,
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
      translated: 0,
      failed: [],
      clearedWithoutWork: 0,
      results: [],
    });
    expect(tables).toEqual(["events", "events"]);
  });

  it("reads translation_needed_at as text so JSON nulls are not flagged", async () => {
    const columns: string[] = [];
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const method of ["select", "eq", "order", "limit", "gte", "in", "range"]) {
      builder[method] = vi.fn(chain);
    }
    builder.not = vi.fn((column: string) => {
      columns.push(column);
      return builder;
    });
    builder.then = (
      resolve: (value: { data: unknown[]; error: null }) => unknown,
    ) => Promise.resolve({ data: [], error: null }).then(resolve);
    const supabase = { from: () => builder };

    await sweepPublishedEventTranslations(supabase as never, { now, limit: 1 });

    expect(columns).toContain(translationNeededAtColumn());
    expect(translationNeededAtColumn()).toBe("source_metadata->>translation_needed_at");
  });

  it("pages past complete soonest events and selects the next incomplete night", async () => {
    const soon = Array.from({ length: 40 }, (_, index) => ({
      id: `soon-${index}`,
      title: "Đêm nhạc",
      description: "Đã có bản dịch.",
      source_locale: "vi",
      starts_at: new Date(Date.parse("2026-09-25T12:00:00.000Z") + index * 86_400_000).toISOString(),
      status: "published",
      source_metadata: {},
    }));
    const far = {
      id: "live-acoustic-duoi-tan-anh-ao-20261126",
      title: "Live Acoustic • Dưới Tán Anh Đào",
      description: "Nhạc acoustic tại Dưới Tán Anh Đào.",
      source_locale: "vi",
      starts_at: "2026-11-26T12:30:00.000Z",
      status: "published",
      source_metadata: {},
    };
    const filled = filledLocales(CONTENT_LOCALES.filter((locale) => locale !== "vi"));
    const translations = soon.flatMap((event) =>
      filled.map((row) => ({ ...row, content_id: event.id })),
    );

    const supabase = {
      from: (table: string) => {
        let flagged = false;
        let limited: number | null = null;
        let range: [number, number] | null = null;
        let ids: string[] = [];
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = vi.fn(chain);
        builder.eq = vi.fn(chain);
        builder.order = vi.fn(chain);
        builder.gte = vi.fn(chain);
        builder.in = vi.fn((column: string, values: string[]) => {
          if (column === "content_id") ids = values;
          return builder;
        });
        builder.not = vi.fn(() => {
          flagged = true;
          return builder;
        });
        builder.limit = vi.fn((count: number) => {
          limited = count;
          return builder;
        });
        builder.range = vi.fn((from: number, to: number) => {
          range = [from, to];
          return builder;
        });
        builder.then = (
          resolve: (value: { data: unknown[]; error: null }) => unknown,
        ) => {
          if (table === "content_translations") {
            return Promise.resolve({
              data: translations.filter((row) => ids.includes(row.content_id)),
              error: null,
            }).then(resolve);
          }
          const rows = flagged ? [] : [...soon, far];
          const start = range?.[0] ?? 0;
          const end = range ? range[1] : (limited ?? rows.length) - 1;
          return Promise.resolve({
            data: rows.slice(start, end + 1),
            error: null,
          }).then(resolve);
        };
        return builder;
      },
    };

    const result = await sweepPublishedEventTranslations(supabase as never, {
      now,
      limit: 1,
    });

    expect(result.scanned).toBeGreaterThan(40);
    expect(result.selected).toEqual(["live-acoustic-duoi-tan-anh-ao-20261126"]);
    expect(result.translated).toBe(0);
    expect(result.failed[0]?.eventId).toBe("live-acoustic-duoi-tan-anh-ao-20261126");
  });
});

describe("translation_needed_at stamp", () => {
  it("sets a stamp when the source text changes and keeps it when the text does not", () => {
    const stamped = withEventTranslationStamp(
      { activity_source_slug: "acoustic" },
      {
        neededAt: "2026-09-27T05:00:00.000Z",
        sourceTextChanged: true,
        previousMetadata: { translation_needed_at: null },
      },
    );
    expect(stamped.translation_needed_at).toBe("2026-09-27T05:00:00.000Z");

    const kept = withEventTranslationStamp(
      { activity_source_slug: "acoustic", translation_needed_at: null },
      {
        neededAt: "2026-09-27T06:00:00.000Z",
        sourceTextChanged: false,
        previousMetadata: { translation_needed_at: "2026-09-27T05:00:00.000Z" },
      },
    );
    expect(kept.translation_needed_at).toBe("2026-09-27T05:00:00.000Z");

    const cleared = withEventTranslationStamp(
      { translation_needed_at: null },
      {
        neededAt: "2026-09-27T06:00:00.000Z",
        sourceTextChanged: false,
        previousMetadata: { translation_needed_at: null },
      },
    );
    expect(cleared.translation_needed_at).toBeUndefined();
  });
});
