import { describe, expect, it } from "vitest";
import type { RentalListing } from "./data";
import { matchesRental, readRentalRoomMinimums, rentalBrowseHref, rentalDiscovery } from "./discovery";

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

  it("applies both room minimums and includes unreported counts when there is no minimum", () => {
    const rooms = rentalDiscovery({ ...listing, details: {
      rooms: { bedrooms: 3, bathrooms: 2, livingRooms: 1 },
      custom: [{ group: "rooms", label: "Study", count: 1 }],
    } }, new Map([["tags", '["Bureau"]']]), key => key);
    const studio = rentalDiscovery({ ...listing, details: { rooms: { bedrooms: 0, bathrooms: 1 } } }, undefined, key => key);
    const unreported = rentalDiscovery(listing, undefined, key => key);

    expect(matchesRental(rooms, "", [], { bedrooms: 2, bathrooms: 2 })).toBe(true);
    expect(matchesRental(rooms, "", [], { bedrooms: 3 })).toBe(true);
    expect(matchesRental(rooms, "", [], { bedrooms: 2, bathrooms: 3 })).toBe(false);
    expect(matchesRental(studio, "", [], { bathrooms: 1 })).toBe(true);
    expect(matchesRental(studio, "", [], { bedrooms: 1 })).toBe(false);
    expect(matchesRental(unreported, "", [])).toBe(true);
    expect(matchesRental(unreported, "", [], { bathrooms: 1 })).toBe(false);
    expect(matchesRental(rooms, "bureau", [])).toBe(true);
    expect(rooms.filters).toEqual([]);
  });

  it("retains room minimums in browse links and supports legacy bedroom and bathroom links", () => {
    const minimums = readRentalRoomMinimums({ bedrooms: "3" }, ["rooms:bedrooms", "rooms:bathrooms"]);
    expect(minimums).toEqual({ bedrooms: 3, bathrooms: 1 });
    expect(rentalBrowseHref("hilltop", ["amenities:wifi"], true, minimums))
      .toBe("/rentals?q=hilltop&filter=amenities%3Awifi&bedrooms=3&bathrooms=1&browse=tours");
    expect(readRentalRoomMinimums({ bedrooms: "1000", bathrooms: ["1", "2"] }, [])).toEqual({});
    expect(readRentalRoomMinimums({ bedrooms: "", bathrooms: "0" }, [])).toEqual({});
  });
});
