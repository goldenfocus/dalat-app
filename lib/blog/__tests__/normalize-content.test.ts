import { describe, it, expect } from "vitest";
import { normalizeStoryContent } from "@/lib/blog/normalize-content";
import { markdownToPlainText } from "@/lib/blog/strip-markdown";

// Pathological auto-generated shape: one physical line, zero newlines,
// starts with "## ", contains links and bold. ~1300 chars.
const PATHOLOGICAL =
  "## This weekend Da Lat is absolutely buzzing with things to do, and we rounded up the very best of them for you. " +
  "The [Festival Hoa](/events/festival-hoa) kicks off Friday evening at Xuan Huong Lake with lantern displays and live music from local artists. " +
  "Organizers expect **thousands of visitors** to stroll the flower-lined promenade throughout the weekend. " +
  "Entry is free, though some workshops require a small fee. " +
  "Over at the [Night Market](/events/night-market), vendors are adding forty new stalls with street food from across the region. " +
  "Do not miss the grilled corn and hot soy milk, a Da Lat classic on a chilly evening. " +
  "Saturday morning brings the **Langbiang sunrise hike**, meeting at 4:30 AM sharp at the trailhead. " +
  "Guides recommend warm layers and a headlamp for the first hour of the climb. " +
  "The view from the summit is worth every step, with clouds rolling over the valley below. " +
  "Sunday afternoon features a pottery workshop at a studio near the [Crazy House](/venues/crazy-house), where beginners are welcome. " +
  "All materials are included in the ticket price, and finished pieces can be picked up the following week. " +
  "Whatever you choose, bring a jacket, because evenings up here get properly cold this time of year.";

describe("normalizeStoryContent", () => {
  it("reflows a single-line auto-generated post into paragraphs", () => {
    expect(PATHOLOGICAL.includes("\n")).toBe(false);
    expect(PATHOLOGICAL.length).toBeGreaterThan(1200);

    const result = normalizeStoryContent(PATHOLOGICAL);

    // At least 4 paragraphs (>= 3 paragraph breaks)
    const breaks = result.split("\n\n").length - 1;
    expect(breaks).toBeGreaterThanOrEqual(3);

    // Leading "## " marker removed
    expect(result.startsWith("##")).toBe(false);

    // Link + bold syntax survives intact
    expect(result).toContain("[Festival Hoa](/events/festival-hoa)");
    expect(result).toContain("[Night Market](/events/night-market)");
    expect(result).toContain("[Crazy House](/venues/crazy-house)");
    expect(result).toContain("**thousands of visitors**");
    expect(result).toContain("**Langbiang sunrise hike**");

    // No placeholder tokens leaked
    expect(result).not.toContain("\u0000");

    // First sentence is its own lead paragraph
    expect(result.split("\n\n")[0]).toBe(
      "This weekend Da Lat is absolutely buzzing with things to do, and we rounded up the very best of them for you."
    );
  });

  it("reflows a single-line wall-of-text post that has NO leading heading", () => {
    // 64 posts in prod are single-line without the "## " prefix — they render
    // as one giant paragraph instead of columns, but still need reflowing.
    const noHeading = PATHOLOGICAL.slice(3); // same content, marker stripped
    expect(noHeading.includes("\n")).toBe(false);
    expect(noHeading.startsWith("## ")).toBe(false);

    const result = normalizeStoryContent(noHeading);

    const breaks = result.split("\n\n").length - 1;
    expect(breaks).toBeGreaterThanOrEqual(3);
    expect(result).toContain("[Festival Hoa](/events/festival-hoa)");
    expect(result).not.toContain("\u0000");
  });

  it("passes through legit multi-paragraph markdown byte-identical", () => {
    const legit =
      "## Heading\n\nFirst paragraph with some detail about the event and what to expect when you arrive.\n\n" +
      "## Another Section\n\nSecond paragraph with [a link](/events/x) and **bold** text.\n\n- item one\n- item two\n";
    expect(normalizeStoryContent(legit)).toBe(legit);
  });

  it("passes through short one-liners under 400 chars byte-identical", () => {
    const short = "## Quick update: the market moved to Saturday.";
    expect(normalizeStoryContent(short)).toBe(short);

    const noHeading = "Just a plain short post without any heading marker.";
    expect(normalizeStoryContent(noHeading)).toBe(noHeading);
  });
});

describe("markdownToPlainText", () => {
  it("strips links and bold to plain text", () => {
    expect(markdownToPlainText("[Festival Hoa](/events/x) is **great**")).toBe(
      "Festival Hoa is great"
    );
  });

  it("drops images and strips heading/quote markers", () => {
    expect(
      markdownToPlainText("## Title\n\n![cover](https://cdn.dalat.app/x.png)\n\n> quoted _text_ here")
    ).toBe("Title quoted text here");
  });

  it("truncates at a word boundary with an ellipsis", () => {
    const result = markdownToPlainText(
      "The festival runs all weekend with music and food",
      20
    );
    expect(result.length).toBeLessThanOrEqual(21);
    expect(result.endsWith("…")).toBe(true);
    // No mid-word cut before the ellipsis
    expect(result).toBe("The festival runs…");
  });

  it("does not append an ellipsis when nothing is truncated", () => {
    expect(markdownToPlainText("Short text", 100)).toBe("Short text");
  });
});
