import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const getTranslations = vi.hoisted(() => vi.fn());
vi.mock("@/lib/translations", () => ({ getTranslations }));
import { getSeriesTranslation, weeklyScheduleLabel } from "./translation";

const series = { id: "series-1", title: "Market", description: "Every Sunday" };
function client(occurrence: { id: string; source_locale: string } | null) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "is", "order", "limit"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue({ data: occurrence });
  return { db: { from: vi.fn(() => query) } as unknown as SupabaseClient, query };
}

describe("series translations from matching public occurrences", () => {
  beforeEach(() => getTranslations.mockReset());
  it("uses only an occurrence matching the current source and requested language", async () => {
    const { db, query } = client({ id: "event-1", source_locale: "en" });
    getTranslations.mockResolvedValue(new Map([["title", "Marché"], ["description", "Chaque dimanche"]]));
    expect(await getSeriesTranslation(db, series, "fr")).toEqual({ title: "Marché", description: "Chaque dimanche", sourceLocale: "en" });
    expect(query.eq).toHaveBeenCalledWith("status", "published");
    expect(query.eq).toHaveBeenCalledWith("title", series.title);
    expect(query.eq).toHaveBeenCalledWith("description", series.description);
    expect(getTranslations).toHaveBeenCalledWith("event", "event-1", "fr");
  });
  it("keeps source text when no matching occurrence exists", async () => {
    expect(await getSeriesTranslation(client(null).db, series, "fr")).toBeNull();
    expect(getTranslations).not.toHaveBeenCalled();
  });
  it("does not substitute translations for the source language", async () => {
    expect(await getSeriesTranslation(client({ id: "event-1", source_locale: "en" }).db, series, "en")).toBeNull();
    expect(getTranslations).not.toHaveBeenCalled();
  });
  it("keeps null descriptions distinct from modified occurrence copy", async () => {
    const { db, query } = client(null);
    await getSeriesTranslation(db, { ...series, description: null }, "fr");
    expect(query.is).toHaveBeenCalledWith("description", null);
  });
});

describe("weekly schedule labels", () => {
  it.each(["en", "vi", "ko", "zh", "ru", "fr", "ja", "ms", "th", "de", "es", "id"])("shows the local Sunday and complete hours in %s", (locale) => {
    const sunday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date("2026-11-15T12:00:00Z"));
    expect(weeklyScheduleLabel("FREQ=WEEKLY;BYDAY=SU", "08:00:00", 240, locale)).toBe(`${sunday} · 08:00–12:00`);
  });
  it("does not label alternate weeks as weekly", () => {
    expect(weeklyScheduleLabel("FREQ=WEEKLY;INTERVAL=2;BYDAY=SU", "08:00", 240, "en")).toBeNull();
  });
  it("handles overnight time ranges", () => {
    expect(weeklyScheduleLabel("FREQ=WEEKLY;BYDAY=SA", "23:00:00", 120, "en")).toBe("Saturday · 23:00–01:00");
  });
});
