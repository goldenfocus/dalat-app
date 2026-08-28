import { describe, expect, it } from "vitest";
import {
  countNumberedGuideEntries,
  extractPromisedGuideCount,
  validateGuideForPublishing,
} from "@/lib/blog/guide-quality";

const verifiedEntry = (number: number, name: string) => `## ${number}. ${name}

This place has a concrete address, an honest caveat, and enough practical detail for someone deciding where to work today. [Official source](https://example.com/${number})`;

const verifiedCard = (position: number, name: string) => `~~~guide-place
{"position":${position},"name":"${name}","type":"Work café","description":"A useful, sourced place to work.","address":"${position} Example Street","hours":"Daily 08:00–22:00","detailsUrl":"https://example.com/${position}","detailsLabel":"Official site","mapUrl":"https://www.google.com/maps/search/?api=1&query=${position}","imageUrl":"https://cdn.example.com/${position}.jpg","imageAlt":"${name} workspace","imageCredit":"${name}","amenities":["WiFi","Power"],"caveat":"Confirm before an important call.","sourceUrl":"https://example.com/${position}","sourceLabel":"Official site"}
~~~`;

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

  it("accepts structured visual place cards as explicit guide entries", () => {
    const cards = Array.from({ length: 7 }, (_, index) =>
      verifiedCard(index + 1, `Place ${index + 1}`)
    ).join("\n\n");
    const sources = Array.from(
      { length: 7 },
      (_, index) => `- [Place ${index + 1}](https://example.com/${index + 1})`
    ).join("\n");
    const content = `Information checked online August 28, 2026.

${"This guide explains how each real place was selected and what remote workers should confirm before visiting. ".repeat(12)}

${cards}

## Sources

${sources}`;

    expect(
      validateGuideForPublishing({
        title: "7 Real Places to Work in Da Lat",
        storyContent: content,
      })
    ).toEqual([]);
  });
});
