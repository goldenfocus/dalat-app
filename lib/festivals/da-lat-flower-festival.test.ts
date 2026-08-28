import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FLOWER_FESTIVAL_2026_DATES,
  FLOWER_FESTIVAL_2026_PATH,
  FLOWER_FESTIVAL_EVENT_PATH,
  FLOWER_FESTIVAL_LAST_CHECKED,
  FLOWER_FESTIVAL_PATH,
  FLOWER_FESTIVAL_SOURCES,
} from "./da-lat-flower-festival";

type Messages = {
  events?: { starts?: string; ends?: string };
  flowerFestivalGuide?: Record<string, unknown>;
};

const ROOT = path.resolve(__dirname, "../..");
const SUPPORTED_LOCALES = [
  "en",
  "vi",
  "ko",
  "zh",
  "ru",
  "fr",
  "ja",
  "ms",
  "th",
  "de",
  "es",
  "id",
] as const;

function leafKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key)
  );
}

function readMessages(locale: string): Messages {
  return JSON.parse(
    readFileSync(path.join(ROOT, "messages", `${locale}.json`), "utf8")
  ) as Messages;
}

describe("Da Lat Flower Festival guide", () => {
  it("uses stable hierarchical routes and the corrected event canonical", () => {
    expect(FLOWER_FESTIVAL_PATH).toBe("/festivals/da-lat-flower-festival");
    expect(FLOWER_FESTIVAL_2026_PATH).toBe(
      "/festivals/da-lat-flower-festival/2026"
    );
    expect(FLOWER_FESTIVAL_EVENT_PATH).toBe(
      "/events/da-lat-flower-festival-2026"
    );
  });

  it("keeps the official 2026 core dates and source audit explicit", () => {
    expect(FLOWER_FESTIVAL_2026_DATES).toEqual({
      opening: "2026-12-19",
      closing: "2026-12-31",
    });
    expect(FLOWER_FESTIVAL_LAST_CHECKED).toBe("2026-08-27");

    const sources = Object.values(FLOWER_FESTIVAL_SOURCES).map(
      (source) => new URL(source)
    );
    expect(sources).toHaveLength(4);
    expect(sources.every((source) => source.protocol === "https:")).toBe(true);
    expect(sources.some((source) => source.hostname === "bvhttdl.gov.vn")).toBe(
      true
    );
    expect(
      sources.every(
        (source) =>
          source.hostname.endsWith("gov.vn") ||
          source.hostname === "vietnamtourism.gov.vn"
      )
    ).toBe(true);
  });

  it("ships the complete guide, archival disclosure and date labels in all 12 locales", () => {
    const english = readMessages("en");
    const expectedKeys = leafKeys(english.flowerFestivalGuide).sort();

    expect(expectedKeys.length).toBeGreaterThan(100);

    for (const locale of SUPPORTED_LOCALES) {
      const messages = readMessages(locale);
      const actualKeys = leafKeys(messages.flowerFestivalGuide).sort();
      const guide = messages.flowerFestivalGuide as {
        common?: { imageAlt?: string; imageCaption?: string };
      };

      expect(actualKeys, locale).toEqual(expectedKeys);
      expect(messages.events?.starts, locale).toBeTruthy();
      expect(messages.events?.ends, locale).toBeTruthy();
      expect(guide.common?.imageAlt, locale).toContain("2024");
      expect(guide.common?.imageCaption, locale).toContain("2024");
    }
  });
});
