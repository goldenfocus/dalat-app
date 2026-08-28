import { describe, expect, it } from "vitest";
import { normalizeVenueSearchText, venueMatchesSearch } from "./search";

const venue = {
  name: "PHỐ BÊN ĐỒI",
  address: "10 Đường Lý Tự Trọng, Đà Lạt",
  slug: "phobendoi",
};

describe("venue search normalization", () => {
  it("folds Vietnamese diacritics without translating the name", () => {
    expect(normalizeVenueSearchText("PHỐ BÊN ĐỒI")).toBe("pho ben doi");
    expect(venueMatchesSearch(venue, "Pho Ben Doi")).toBe(true);
  });

  it("matches canonical addresses and compact slugs", () => {
    expect(venueMatchesSearch(venue, "duong ly tu trong")).toBe(true);
    expect(venueMatchesSearch(venue, "pho-ben-doi")).toBe(true);
  });

  it("does not treat an automatic translation as the venue identity", () => {
    expect(venueMatchesSearch(venue, "Hillside Street")).toBe(false);
  });

  it("preserves non-Latin scripts", () => {
    expect(normalizeVenueSearchText("山坡街")).toBe("山坡街");
    expect(venueMatchesSearch({ name: "山坡街" }, "山坡")).toBe(true);
  });

  it("uses deterministic casing independent of the device locale", () => {
    expect(normalizeVenueSearchText("ISTANBUL")).toBe("istanbul");
  });
});
