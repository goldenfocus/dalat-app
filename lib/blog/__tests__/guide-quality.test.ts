import { describe, expect, it } from "vitest";
import {
  countNumberedGuideEntries,
  extractPromisedGuideCount,
  validateGuideForPublishing,
} from "@/lib/blog/guide-quality";

const verifiedEntry = (number: number, name: string) => `## ${number}. ${name}

This place has a concrete address, an honest caveat, and enough practical detail for someone deciding where to work today. [Official source](https://example.com/${number})`;

describe("guide publishing quality", () => {
  it("recognizes a promised place count without mistaking a year for one", () => {
    expect(
      extractPromisedGuideCount(
        "Da Lat Coworking Cafes: 18 Best WiFi & Work Spots for Digital Nomads"
      )
    ).toBe(18);
    expect(extractPromisedGuideCount("Remote Work in Da Lat: 2026 Guide")).toBeNull();
  });

  it("counts only explicit numbered entry headings", () => {
    const content = `${verifiedEntry(1, "First Place")}\n\n${verifiedEntry(2, "Second Place")}\n\n## Sources\n\n- [Source](https://example.com)`;
    expect(countNumberedGuideEntries(content)).toBe(2);
  });

  it("rejects a numbered headline whose public story contains no list", () => {
    const issues = validateGuideForPublishing({
      title: "Da Lat Coworking Cafes: 18 Best WiFi & Work Spots for Digital Nomads",
      storyContent:
        "The mist rolls past my laptop while I describe the city in broad terms. ".repeat(45),
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "missing_checked_date",
        "missing_sources",
        "count_mismatch",
        "insufficient_place_links",
      ])
    );
  });

  it("rejects a place guide with filler but no explicit entries", () => {
    const content = `Information checked online August 27, 2026.

${"This paragraph offers generic remote-work advice without naming a real place. ".repeat(30)}

## Sources

- [Research](https://example.com/research)`;
    const issues = validateGuideForPublishing({
      title: "Da Lat Coworking Guide",
      storyContent: content,
    });

    expect(issues.map((issue) => issue.code)).toContain("missing_entries");
  });

  it("rejects repeated headings, numbering, and evidence links", () => {
    const repeatedEntries = Array.from(
      { length: 8 },
      () => `## 1. Fake Place

This repeated entry pads the guide without adding a distinct, verifiable business. [Same source](https://example.com/same)`
    ).join("\n\n");
    const content = `Information checked online August 27, 2026.

${"This introduction explains that every listed place should have distinct evidence. ".repeat(12)}

${repeatedEntries}

## Sources

- [Same source](https://example.com/same)`;
    const issues = validateGuideForPublishing({
      title: "8 Real Places to Work in Da Lat",
      storyContent: content,
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "invalid_numbering",
        "duplicate_entries",
        "insufficient_place_links",
      ])
    );
  });

  it("accepts a sourced guide whose title count matches its visible entries", () => {
    const entries = Array.from({ length: 8 }, (_, index) =>
      verifiedEntry(index + 1, `Place ${index + 1}`)
    ).join("\n\n");
    const content = `Information checked online August 27, 2026. Details can change, so confirm before travelling.

This introduction explains the selection method and makes clear that documented facts are not personal speed tests or guaranteed opening hours. It gives readers enough context to choose between dedicated coworking and ordinary cafés without pretending every venue offers the same setup.

${entries}

## Sources

- [Research index](https://example.com/sources)`;

    expect(
      validateGuideForPublishing({
        title: "8 Real Places to Work in Da Lat",
        storyContent: content,
      })
    ).toEqual([]);
  });
});
