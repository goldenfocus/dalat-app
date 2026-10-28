import { describe, expect, it } from "vitest";
import { getLocationMapLinks, resolveEventLocation, type LocationVenue } from "./location";

const venue: LocationVenue = {
  id: "social-house", slug: "social-house-dalat", name: "Social House Dalat",
  address: "184 Đường Tô Ngọc Vân, Đà Lạt", latitude: 11.9467648, longitude: 108.4341887,
  google_maps_url: "https://maps.app.goo.gl/2XHcfUNDzv4Da24L6",
};
const stale = {
  location_name: "Old address", address: "Old address", latitude: null, longitude: null,
  google_maps_url: "https://www.google.com/maps/search/?api=1&query=old-address",
};

describe("canonical venue locations", () => {
  it("replaces an occurrence's copied address and map with its venue pin", () => {
    const result = resolveEventLocation(stale, venue);
    expect(result).toMatchObject({ location_name: venue.name, address: venue.address, latitude: venue.latitude, longitude: venue.longitude });
    expect(getLocationMapLinks(result)).toEqual({
      map: "https://www.google.com/maps/search/?api=1&query=11.9467648,108.4341887",
      directions: "https://www.google.com/maps/dir/?api=1&destination=11.9467648,108.4341887",
    });
    expect(stale.address).toBe("Old address");
  });
  it("automatically follows venue edits for the series and every occurrence", () => {
    const moved = { ...venue, address: "New entrance", latitude: 12, longitude: 109 };
    for (const record of [{ ...stale, id: "series" }, { ...stale, id: "today" }, { ...stale, id: "next-month" }]) {
      expect(resolveEventLocation(record, moved)).toMatchObject({ id: record.id, address: "New entrance", latitude: 12, longitude: 109 });
    }
  });
  it("never mixes missing venue fields with stale event coordinates", () => {
    const result = resolveEventLocation({ ...stale, latitude: 1, longitude: 2 }, { ...venue, latitude: null, longitude: null });
    expect(result.latitude).toBeNull();
    expect(result.google_maps_url).toBe(venue.google_maps_url);
    expect(getLocationMapLinks(result).directions).toBeNull();
  });
  it.each([{ has_private_details: true }, { is_online: true }])("does not inherit a physical venue for %j", (flags) => {
    const record = { ...stale, ...flags };
    expect(resolveEventLocation(record, venue)).toBe(record);
  });
  it("does not offer directions to an unrevealed private or online location", () => {
    expect(getLocationMapLinks({ location_name: "Secret location", has_private_details: true })).toEqual({ map: null, directions: null });
    expect(getLocationMapLinks({ ...stale, is_online: true })).toEqual({ map: null, directions: null });
  });
  it("preserves independent events without linked venues", () => {
    expect(resolveEventLocation(stale, null)).toBe(stale);
    expect(getLocationMapLinks(stale).map).toBe(stale.google_maps_url);
  });
  it("uses the canonical name and address if the venue has no pin or saved link", () => {
    const result = resolveEventLocation(stale, { ...venue, latitude: null, longitude: null, google_maps_url: null });
    expect(result.google_maps_url).toContain(encodeURIComponent(`${venue.name}, ${venue.address}`));
  });
  it("accepts zero coordinates and rejects invalid coordinate pairs", () => {
    expect(getLocationMapLinks({ latitude: 0, longitude: 0 }).directions).toContain("destination=0,0");
    for (const latitude of [NaN, Infinity, 91]) expect(getLocationMapLinks({ latitude, longitude: 108 }).directions).toBeNull();
  });
});
