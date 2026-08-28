import { describe, expect, it } from "vitest";
import {
  extractGuidePlaceCards,
  parseGuidePlaceCard,
} from "@/lib/blog/guide-place";

const card = {
  position: 1,
  name: "Daily Log Coffee",
  type: "Work café",
  description: "A useful place to work.",
  address: "15 Thông Thiên Học, Da Lat",
  hours: "Daily, 7:30 AM–10:30 PM",
  detailsUrl: "https://example.com/details",
  detailsLabel: "Official site",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=Daily+Log",
  imageUrl: "https://cdn.dalat.app/example.webp",
  imageAlt: "A work table at Daily Log Coffee",
  imageCredit: "Daily Log Coffee",
  categoryLinks: [{ label: "Da Lat cafés", href: "/cafes" }],
  caveat: "A public café, so noise can vary.",
  sourceUrl: "https://example.com/source",
  sourceLabel: "Daily Log Coffee",
};

describe("guide place cards", () => {
  it("parses a complete linked place card", () => {
    expect(parseGuidePlaceCard(JSON.stringify(card))).toEqual(card);
  });

  it("rejects incomplete or non-http cards", () => {
    expect(
      parseGuidePlaceCard(JSON.stringify({ ...card, mapUrl: "javascript:alert(1)" }))
    ).toBeNull();
    expect(
      parseGuidePlaceCard(
        JSON.stringify({
          ...card,
          categoryLinks: [{ label: "WiFi", href: "https://example.com" }],
        })
      )
    ).toBeNull();
  });

  it("maps older card types to real internal category pages", () => {
    const { categoryLinks: _categoryLinks, ...legacyCard } = card;

    expect(parseGuidePlaceCard(JSON.stringify(legacyCard))?.categoryLinks).toEqual([
      { label: "Da Lat cafés", href: "/cafes" },
    ]);
  });

  it("extracts both tilde and backtick guide-place fences", () => {
    const markdown = [
      `~~~guide-place\n${JSON.stringify(card)}\n~~~`,
      `\`\`\`guide-place\n${JSON.stringify({ ...card, position: 2, name: "Q Coffee" })}\n\`\`\``,
    ].join("\n\n");

    expect(extractGuidePlaceCards(markdown).map((place) => place.name)).toEqual([
      "Daily Log Coffee",
      "Q Coffee",
    ]);
  });
});
