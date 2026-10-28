import { describe, expect, it } from "vitest";
import type { Venue } from "@/lib/types";
import {
  generateLocalBusinessSchema,
  generateVenuePageSchema,
} from "@/lib/structured-data";
import { generateVenueMetadata } from "@/lib/metadata";
const venue = {
  slug: "social-house-dalat",
  name: "Social House Dalat",
  description: "Ein Café in Đà Lạt.",
  venue_type: "cafe",
  address: "184 Tô Ngọc Vân",
  latitude: 11.94,
  longitude: 108.43,
  photos: [],
  operating_hours: {
    monday: { open: "07:00", close: "22:00" },
    tuesday: "closed",
  },
  is_verified: true,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-20T00:00:00Z",
} as unknown as Venue;
describe("venue search entity graph", () => {
  it("joins localized pages to one place, using actual canonical URLs and visible facts", () => {
    const de = generateVenuePageSchema(venue, "de", {
      venuesLabel: "Veranstaltungsorte",
    });
    const en = generateVenuePageSchema(venue, "en", { venuesLabel: "Venues" });
    expect(de["@graph"][0]).toMatchObject({
      "@id": "https://dalat.app/social-house-dalat#place",
      url: "https://dalat.app/de/social-house-dalat",
      description: venue.description,
    });
    expect(de["@graph"][0]["@id"]).toBe(en["@graph"][0]["@id"]);
    expect(de["@graph"][1]).toMatchObject({
      inLanguage: "de",
      mainEntity: { "@id": "https://dalat.app/social-house-dalat#place" },
      dateModified: venue.updated_at,
    });
    expect(JSON.stringify(de)).not.toContain("/venues/social-house-dalat");
    expect(JSON.stringify(de)).not.toContain("aggregateRating");
    expect(de["@graph"][0]).not.toHaveProperty("isAccessibleForFree");
    expect(de["@graph"][0]).not.toHaveProperty("event");
  });
  it("explicitly represents closed days and omits unknown coordinates and malformed hours", () => {
    const schema = generateLocalBusinessSchema(
      {
        ...venue,
        latitude: null,
        longitude: null,
        operating_hours: {
          ...venue.operating_hours,
          wednesday: { open: "unknown", close: "late" },
        },
      } as unknown as Venue,
      "de",
    );
    expect(schema).not.toHaveProperty("geo");
    expect(schema.openingHoursSpecification).toContainEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "https://schema.org/Tuesday",
      opens: "00:00",
      closes: "00:00",
    });
    expect(schema.openingHoursSpecification).toHaveLength(2);
  });
  it("preserves short translated descriptions, adds city context and noindexes incomplete languages", () => {
    const metadata = generateVenueMetadata(
      { ...venue, logo_url: null, cover_photo_url: null },
      "de",
      0,
      { availableLocales: ["en"] },
    );
    expect(metadata.description).toBe(venue.description);
    expect(metadata.title).toContain("Đà Lạt");
    expect(metadata.robots).toMatchObject({
      index: false,
      follow: true,
      googleBot: { index: false },
    });
    expect(metadata.alternates?.languages).not.toHaveProperty("de");
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      url: "https://dalat.app/de/social-house-dalat",
    });
  });
});
