import { describe, expect, it } from "vitest";
import {
  buildVitalityFloorProblem,
  formatVitalityBreakdown,
  summarizeEventVitality,
  type EventVitalityRow,
} from "./vitality";

const row = (overrides: Partial<EventVitalityRow>): EventVitalityRow => ({
  id: "event-1",
  starts_at: "2026-08-26T12:00:00.000Z",
  series_id: null,
  organizer_id: "organizer-1",
  source_platform: null,
  organizers: { name: "Dalat Community" },
  ...overrides,
});

describe("summarizeEventVitality", () => {
  it("counts many occurrences of one recurring series as one choice", () => {
    const summary = summarizeEventVitality([
      row({ id: "weekly-1", series_id: "weekly", starts_at: "2026-08-26T12:00:00Z" }),
      row({ id: "weekly-2", series_id: "weekly", starts_at: "2026-09-02T12:00:00Z" }),
      row({ id: "weekly-3", series_id: "weekly", starts_at: "2026-09-09T12:00:00Z" }),
    ]);

    expect(summary).toMatchObject({
      occurrences: 3,
      distinctChoices: 1,
      recurringSeries: 1,
      oneOffChoices: 0,
    });
    expect(summary.organizers[0]).toMatchObject({
      label: "Dalat Community",
      distinctChoices: 1,
    });
  });

  it("counts standalone events separately and reports source and organizer mix", () => {
    const summary = summarizeEventVitality([
      row({ id: "weekly-1", series_id: "weekly", source_platform: "meetup" }),
      row({ id: "weekly-2", series_id: "weekly", source_platform: "meetup" }),
      row({
        id: "flower-festival",
        organizer_id: "organizer-2",
        organizers: { name: "Flower Festival" },
        source_platform: "dalat-gov",
      }),
      row({ id: "coffee-night", source_platform: null }),
    ]);

    expect(summary).toMatchObject({
      occurrences: 4,
      distinctChoices: 3,
      recurringSeries: 1,
      oneOffChoices: 2,
    });
    expect(summary.sources).toEqual([
      { key: "dalat-gov", label: "dalat-gov", distinctChoices: 1 },
      { key: "manual", label: "manual", distinctChoices: 1 },
      { key: "meetup", label: "meetup", distinctChoices: 1 },
    ]);
    expect(summary.organizers).toEqual([
      { key: "organizer-1", label: "Dalat Community", distinctChoices: 2 },
      { key: "organizer-2", label: "Flower Festival", distinctChoices: 1 },
    ]);
  });

  it("uses the earliest series occurrence for deterministic diagnostics", () => {
    const summary = summarizeEventVitality([
      row({
        id: "later",
        series_id: "weekly",
        starts_at: "2026-09-02T12:00:00Z",
        source_platform: "later-source",
      }),
      row({
        id: "earlier",
        series_id: "weekly",
        starts_at: "2026-08-26T12:00:00Z",
        source_platform: "original-source",
      }),
    ]);

    expect(summary.sources).toEqual([
      {
        key: "original-source",
        label: "original-source",
        distinctChoices: 1,
      },
    ]);
  });

  it("makes missing attribution visible instead of dropping it", () => {
    const summary = summarizeEventVitality([
      row({
        id: "unassigned",
        organizer_id: null,
        organizers: null,
        source_platform: "",
      }),
    ]);

    expect(summary.organizers).toEqual([
      { key: "unassigned", label: "Unassigned", distinctChoices: 1 },
    ]);
    expect(summary.sources).toEqual([
      { key: "manual", label: "manual", distinctChoices: 1 },
    ]);
  });

  it("never treats a synthetic canary as customer-facing supply", () => {
    const summary = summarizeEventVitality([
      row({ id: "real-event" }),
      row({ id: "synthetic", source_platform: "canary" }),
    ]);

    expect(summary).toMatchObject({ occurrences: 1, distinctChoices: 1 });
    expect(summary.sources).toEqual([
      { key: "manual", label: "manual", distinctChoices: 1 },
    ]);
  });
});

describe("formatVitalityBreakdown", () => {
  it("caps long diagnostics while preserving the omitted group count", () => {
    const breakdown = ["A", "B", "C"].map((label) => ({
      key: label.toLowerCase(),
      label,
      distinctChoices: 1,
    }));

    expect(formatVitalityBreakdown(breakdown, 2)).toBe("A 1, B 1, +1 more");
    expect(formatVitalityBreakdown([])).toBe("none");
  });
});

describe("buildVitalityFloorProblem", () => {
  it("makes an occurrence-inflated production state loud", () => {
    const summary = summarizeEventVitality([
      row({ id: "weekly-1", series_id: "weekly" }),
      row({
        id: "weekly-2",
        series_id: "weekly",
        starts_at: "2026-09-02T12:00:00Z",
      }),
    ]);

    expect(buildVitalityFloorProblem(summary, 8)).toBe(
      "Only 1 distinct published event choice in the next 14 days " +
        "(2 occurrences; floor: 8). Sources: manual 1. " +
        "Organizers: Dalat Community 1."
    );
  });

  it("stays quiet only when the distinct-choice floor is met", () => {
    const summary = summarizeEventVitality(
      Array.from({ length: 8 }, (_, index) =>
        row({ id: `event-${index}`, series_id: null })
      )
    );

    expect(buildVitalityFloorProblem(summary, 8)).toBeNull();
  });
});
