import { describe, expect, it } from "vitest";
import {
  ACTIVITY_FACT_ART_SIZE,
  activityFactArtPath,
  activityFactArtUrl,
  buildActivityFactArtModel,
  formatActivityFactArtDate,
  parseActivityFactArtPath,
} from "./fact-art";

describe("Activity Graph fact art", () => {
  it("builds stable, public 4:5 PNG URLs for event and series slugs", () => {
    expect(ACTIVITY_FACT_ART_SIZE).toEqual({ width: 1200, height: 1500 });
    expect(activityFactArtPath("event", "ha-nhi-da-lat")).toBe(
      "/activity-art/events/ha-nhi-da-lat.png",
    );
    expect(activityFactArtUrl("event", "ha-nhi-da-lat")).toBe(
      "https://dalat.app/activity-art/events/ha-nhi-da-lat.png",
    );
    expect(
      activityFactArtUrl("series", "live-acoustic", "https://preview.example"),
    ).toBe("https://preview.example/activity-art/series/live-acoustic.png");
  });

  it("encodes Unicode as one slug segment and rejects path injection", () => {
    expect(activityFactArtPath("event", "đêm-nhạc")).toBe(
      "/activity-art/events/%C4%91%C3%AAm-nh%E1%BA%A1c.png",
    );
    expect(() => activityFactArtPath("event", "../secret")).toThrow();
    expect(() => activityFactArtPath("event", "nested/slug")).toThrow();
  });

  it("parses only supported image paths", () => {
    expect(parseActivityFactArtPath("events", "ha-nhi.png")).toEqual({
      kind: "event",
      slug: "ha-nhi",
    });
    expect(parseActivityFactArtPath("series", "live-acoustic.PNG")).toEqual({
      kind: "series",
      slug: "live-acoustic",
    });
    expect(parseActivityFactArtPath("people", "ha-nhi.png")).toBeNull();
    expect(parseActivityFactArtPath("events", "ha-nhi.jpg")).toBeNull();
  });

  it("is deterministic while varying the palette by slug", () => {
    const base = {
      kind: "event" as const,
      title: "Hà Nhi - Đà Lạt",
      startsAt: "2026-08-30T10:00:00.000Z",
      venue: "Mây Lang Thang",
    };
    const first = buildActivityFactArtModel({ ...base, slug: "ha-nhi" });
    const repeat = buildActivityFactArtModel({ ...base, slug: "ha-nhi" });
    const another = buildActivityFactArtModel({ ...base, slug: "uyen-linh" });

    expect(first).toEqual(repeat);
    expect(first.palette).not.toEqual(another.palette);
    expect(first.date).toBe("30 Aug 2026 · 17:00");
    expect(first.venue).toBe("Mây Lang Thang");
  });

  it("bounds long facts and has truthful empty fallbacks", () => {
    const model = buildActivityFactArtModel({
      kind: "series",
      slug: "weekly-acoustic",
      title: "A very long recurring activity title ".repeat(6),
      scheduleText: "Every Wednesday from 19:30 until 21:30 in Đà Lạt",
      venue: "A very long venue and street address ".repeat(5),
    });

    expect(model.eyebrow).toBe("RECURRING ACTIVITY");
    expect(model.title.endsWith("…")).toBe(true);
    expect(model.title.length).toBeLessThanOrEqual(76);
    expect(model.date.length).toBeLessThanOrEqual(48);
    expect(model.venue.length).toBeLessThanOrEqual(62);
    expect(formatActivityFactArtDate(null)).toBe("Schedule on ĐàLạt.app");
  });
});
