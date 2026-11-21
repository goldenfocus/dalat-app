import { describe, expect, it } from "vitest";
import type { RentalListing } from "./data";
import { matchesRental, rentalDiscovery } from "./discovery";

const listing: RentalListing = {
  id: "listing",
  host_id: "host",
  title: "Hilltop home",
  description: "A place to stay",
  source_locale: "en",
  monthly_rent: 1_000_000,
  six_month_rent: null,
  yearly_rent: null,
  offer_type: "rent",
  sale_price: null,
  photos: [],
  videos: [],
  status: "published",
  details: {
    utilities: { water: "included", electricity: "notIncluded" },
    rules: { dogs: "notAllowed", parties: "allowed" },
    minimumChildAge: 18,
    custom: [
      { group: "amenities", label: "Heating", pricing: "notIncluded" },
      { group: "amenities", label: "Sauna", pricing: 100_000 },
      { group: "amenities", label: "Bicycle", pricing: "included" },
      { group: "amenities", label: "WiFi adapter" },
      { group: "rules", label: "No shoes inside" },
    ],
  },
};

describe("rental discovery", () => {
  it("indexes available amenities and affirmative choices in the original and translated labels", () => {
    const strings = new Map([["tags", JSON.stringify(["Chauffage", "Sauna", "Vélo", "Adaptateur Wi-Fi", "Sans chaussures"])]]);
    const result = rentalDiscovery(listing, strings, key => key);

    expect(result.filters.map(fact => fact.label)).toEqual([
      "water", "parties · allowed", "Vélo", "Adaptateur Wi-Fi",
    ]);
    expect(matchesRental(result, "velo", ["amenities:water:included"])).toBe(true);
    expect(matchesRental(result, "bicycle", [])).toBe(true);
    for (const query of ["electricity", "chauffage", "sauna", "dogs", "chaussures"]) {
      expect(matchesRental(result, query, [])).toBe(false);
    }
  });
});
