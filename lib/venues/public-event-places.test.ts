import { describe, expect, it, vi } from "vitest";
import { matchPublicEventPlace, searchPublicEventPlaces } from "./public-event-places";

const { house, neighbor } = vi.hoisted(() => ({
  house: { id: "node/1", name: "Cà Phê Trên Đồi", address: "55 Ngô Thì Sỹ",
    latitude: 11.94, longitude: 108.44, venueType: "cafe" },
  neighbor: { id: "node/2", name: "Tiệm Bánh", address: "56 Ngô Thì Sỹ",
    latitude: 11.94, longitude: 108.441, venueType: "cafe" },
}));
vi.mock("@/public/data/venues/dalat-openstreetmap.json", () => ({ default: { venues: [house, neighbor] } }));

describe("public event venues", () => {
  it("finds the exact public street number even without accents", () => {
    expect(searchPublicEventPlaces("55 D. Ngo Thi Sy, Da Lat")).toEqual([house]);
    expect(searchPublicEventPlaces("5 Ngo Thi Sy")).toEqual([]);
  });

  it("can link a typed address uniquely associated with a public venue", () => {
    expect(matchPublicEventPlace({
      name: "55 Ngo Thi Sy, Da Lat", address: "55 Ngo Thi Sy, Da Lat", latitude: null, longitude: null,
    })).toBe(house);
  });

  it("does not attach a different business or a generic private address", () => {
    expect(matchPublicEventPlace({
      name: "Different Cafe", address: house.address, latitude: house.latitude, longitude: house.longitude,
    })).toBeNull();
    expect(matchPublicEventPlace({
      name: "12 Ngo Thi Sy", address: "12 Ngo Thi Sy", latitude: null, longitude: null,
    })).toBeNull();
  });

  it("does not substitute a different location when the supplied pin is far away", () => {
    expect(matchPublicEventPlace({
      name: house.address, address: house.address, latitude: 12.5, longitude: 108.9,
    })).toBeNull();
  });
});
