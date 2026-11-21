import { describe, expect, it } from "vitest";
import { rentalSearchLocales, rentalSearchModifiedAt } from "./search-indexing";
import { isRentalSlug, rentalListingPath } from "./urls";

const listing = {
  id: "original", slug: "azalea-villa-da-lat", status: "published", source_locale: "en",
  description: "Villa with a garden", photos: [], updated_at: "2026-11-21T00:00:00Z",
};
const title = {
  content_id: listing.id, field_name: "title", target_locale: "fr", translated_text: "Azalea Villa",
  translation_status: "auto", ai_reviewed_at: "2026-11-22T00:00:00Z", updated_at: "2026-11-22T00:00:00Z",
};
const description = { ...title, field_name: "description", translated_text: "Villa avec jardin" };

describe("rental indexing readiness", () => {
  it("includes source and fully reviewed localized prose for published listings only", () => {
    expect(rentalSearchLocales(listing, [])).toEqual(["en"]);
    expect(rentalSearchLocales(listing, [title])).toEqual(["en"]);
    expect(rentalSearchLocales(listing, [title, { ...description, ai_reviewed_at: null }])).toEqual(["en"]);
    expect(rentalSearchLocales(listing, [title, description])).toEqual(["en", "fr"]);
    expect(rentalSearchLocales({ ...listing, status: "draft" }, [title, description])).toEqual([]);
  });

  it("uses true source/translated modification time and skips missing source fields", () => {
    expect(rentalSearchLocales({ ...listing, description: "" }, [{ ...title, translation_status: "edited", ai_reviewed_at: null }]))
      .toEqual(["en", "fr"]);
    expect(rentalSearchModifiedAt(listing, "fr", [title, description]).toISOString())
      .toBe("2026-11-22T00:00:00.000Z");
    expect(rentalSearchModifiedAt(listing, "en", [title, description]).toISOString())
      .toBe("2026-11-21T00:00:00.000Z");
  });

  it("keeps private UUID paths and safely encodes readable public slugs", () => {
    expect(rentalListingPath(listing)).toBe("/rentals/listing/azalea-villa-da-lat");
    expect(rentalListingPath({ ...listing, status: "draft" })).toBe("/rentals/listing/original");
    expect(rentalListingPath({ ...listing, slug: "別荘-da-lat" })).toBe("/rentals/listing/%E5%88%A5%E8%8D%98-da-lat");
    expect(isRentalSlug("別荘-da-lat")).toBe(true);
    expect(isRentalSlug("../dir?slug=x")).toBe(false);
  });
});
