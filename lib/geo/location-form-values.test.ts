import { describe, it, expect } from "vitest";
import {
  buildLocationFieldValues,
  isCustomLocationCandidate,
  makeCustomLocation,
} from "@/lib/geo/location-form-values";

const venue = {
  name: "Phố Bên Đồi",
  address: "12 Lý Tự Trọng, Đà Lạt",
  googleMapsUrl: "https://maps.google.com/?cid=123",
  latitude: 11.9446,
  longitude: 108.4383,
};

describe("buildLocationFieldValues", () => {
  it("passes through a selected location and stringifies coordinates", () => {
    expect(buildLocationFieldValues(venue, "Phố Bên Đồi")).toEqual({
      location_name: "Phố Bên Đồi",
      address: "12 Lý Tự Trọng, Đà Lạt",
      google_maps_url: "https://maps.google.com/?cid=123",
      latitude: "11.9446",
      longitude: "108.4383",
    });
  });

  it("emits empty coordinate strings when a selected location has null coords", () => {
    const result = buildLocationFieldValues(
      { ...venue, latitude: null, longitude: null },
      venue.name
    );
    expect(result.latitude).toBe("");
    expect(result.longitude).toBe("");
  });

  // Regression: typed-but-unselected text used to be silently discarded on save.
  it("falls back to the typed query as a custom address when nothing is selected", () => {
    const result = buildLocationFieldValues(null, "  20 D. Sương Nguyệt Anh  ");
    expect(result.location_name).toBe("20 D. Sương Nguyệt Anh");
    expect(result.address).toBe("20 D. Sương Nguyệt Anh");
    expect(result.google_maps_url).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        "20 D. Sương Nguyệt Anh"
      )}`
    );
    expect(result.latitude).toBe("");
    expect(result.longitude).toBe("");
  });

  it("returns all empty fields for whitespace-only query with no selection", () => {
    expect(buildLocationFieldValues(null, "   ")).toEqual({
      location_name: "",
      address: "",
      google_maps_url: "",
      latitude: "",
      longitude: "",
    });
  });

  // The silent fallback must match the visible "Use as typed" offer exactly —
  // never persist text the UI wouldn't have offered as a location.
  it("does not fall back for fragments shorter than 3 chars", () => {
    expect(buildLocationFieldValues(null, "Da").location_name).toBe("");
  });

  it("does not fall back for URL-shaped input (unresolved Maps links)", () => {
    const url = "https://maps.app.goo.gl/xyz123";
    expect(buildLocationFieldValues(null, url).location_name).toBe("");
    expect(buildLocationFieldValues(null, ` HTTP://example.com `).location_name).toBe("");
  });
});

describe("isCustomLocationCandidate", () => {
  it("accepts a real typed address", () => {
    expect(isCustomLocationCandidate("20 D. Sương Nguyệt Anh")).toBe(true);
  });

  it("rejects short fragments, whitespace, and URLs", () => {
    expect(isCustomLocationCandidate("Da")).toBe(false);
    expect(isCustomLocationCandidate("   ")).toBe(false);
    expect(isCustomLocationCandidate("https://maps.app.goo.gl/xyz")).toBe(false);
  });
});

describe("makeCustomLocation", () => {
  it("builds the same shape the fallback submits, from trimmed text", () => {
    const loc = makeCustomLocation("  20 D. Sương Nguyệt Anh ");
    expect(loc).toEqual({
      name: "20 D. Sương Nguyệt Anh",
      address: "20 D. Sương Nguyệt Anh",
      latitude: null,
      longitude: null,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        "20 D. Sương Nguyệt Anh"
      )}`,
    });
    // Both paths (explicit row click and silent fallback) must agree
    const fields = buildLocationFieldValues(null, "  20 D. Sương Nguyệt Anh ");
    expect(fields.location_name).toBe(loc.name);
    expect(fields.google_maps_url).toBe(loc.googleMapsUrl);
  });
});
