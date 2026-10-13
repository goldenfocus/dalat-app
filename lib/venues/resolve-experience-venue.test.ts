import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { matchVenue, streetKey } from "./resolve-experience-venue";
import { hoursFromPeriods } from "./places";

const venues = [
  { id: "a", name: "Ẩm Thực Chay Thiện Ý", address: "145 Phan Chu Trinh, Phường 9, Đà Lạt", latitude: 11.95, longitude: 108.46, google_place_id: null },
  { id: "b", name: "An Lạc Tâm", address: "40 Phạm Ngũ Lão", latitude: null, longitude: null, google_place_id: null },
];

describe("matchVenue", () => {
  it("matches accent/case-insensitive name plus street", () => {
    expect(matchVenue("ẨM THỰC CHAY THIỆN Ý", "145 Phan Chu Trinh, P9", null, venues)?.id).toBe("a");
  });
  it("matches by proximity when the address differs", () => {
    expect(matchVenue("Am thuc chay Thien Y", "", { lat: 11.9501, lng: 108.4601 }, venues)?.id).toBe("a");
  });
  it("refuses same name far away with a different street", () => {
    expect(matchVenue("An Lạc Tâm", "12 Hùng Vương", { lat: 11.9, lng: 108.4 }, venues)).toBeNull();
  });
  it("street key needs a house number", () => {
    expect(streetKey("Phan Chu Trinh")).toBe("");
    expect(streetKey("145 Phan Chu Trinh, P9")).toBe("145 phan chu trinh");
  });
});

describe("hoursFromPeriods", () => {
  it("maps Google periods to OperatingHours", () => {
    const h = hoursFromPeriods([{ open: { day: 1, hour: 6 }, close: { day: 1, hour: 21, minute: 30 } }]);
    expect(h?.monday).toEqual({ open: "06:00", close: "21:30" });
    expect(h?.sunday).toBe("closed");
  });
  it("handles 24/7", () => {
    expect(hoursFromPeriods([{ open: { day: 0, hour: 0 } }])?.friday).toEqual({ open: "00:00", close: "23:59" });
  });
});
