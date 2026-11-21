import { describe, expect, it } from "vitest";
import {
  analyticsSearchQuery, cleanSearchQuery, normalizeSearchQuery, searchIntent, searchKinds,
  searchResultsHref, searchScope, searchShortcut,
} from "./dalat";

describe("city search", () => {
  const labels = Object.fromEntries(searchKinds.map(kind => [kind, kind])) as Record<(typeof searchKinds)[number], string>;
  it("matches accentless Vietnamese and identifies category intent inside a longer query", () => {
    expect(normalizeSearchQuery("Thuê nhà ở Đà Lạt")).toBe("thue nha o da lat");
    expect(searchIntent("Thuê nhà gần Xuân Hương")).toBe("rentals");
    expect(searchShortcut("Rentals", labels, "all")).toBe("rentals");
    expect(searchShortcut("Rentals", labels, "blog")).toBeNull();
  });
  it("preserves the exact query in the localized results route and limits input", () => {
    expect(searchResultsHref("Đà Lạt + cà phê", "venues")).toBe("/search?q=%C4%90%C3%A0+L%E1%BA%A1t+%2B+c%C3%A0+ph%C3%AA&type=venues");
    expect(Array.from(cleanSearchQuery("ư".repeat(130))).length).toBe(100);
    expect(searchScope("anything")).toBe("all");
  });
  it("normalizes aggregate signals and omits common private contact strings", () => {
    expect(analyticsSearchQuery("  Sơn trà  ")).toBe("son tra");
    expect(analyticsSearchQuery("me@example.com")).toBe("");
    expect(analyticsSearchQuery("+84 (123) 456-789")).toBe("");
    expect(analyticsSearchQuery("https://dalat.app/a")).toBe("");
  });
});
