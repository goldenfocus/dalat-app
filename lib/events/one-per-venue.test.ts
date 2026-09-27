import { describe, expect, it } from "vitest";
import {
  normalizeVenueName,
  takeSoonestEventPerVenue,
  type VenueDedupeEvent,
} from "./one-per-venue";

function event(
  partial: Partial<VenueDedupeEvent> & Pick<VenueDedupeEvent, "id" | "starts_at">,
): VenueDedupeEvent {
  return {
    venue_id: null,
    location_name: null,
    latitude: null,
    longitude: null,
    ...partial,
  };
}

describe("normalizeVenueName", () => {
  it("folds case, punctuation, and Vietnamese diacritics", () => {
    expect(normalizeVenueName("  LuLuLoLa Coffee+ ")).toBe("lululola coffee");
    expect(normalizeVenueName("Lâm Viên")).toBe("lam vien");
    expect(normalizeVenueName("Đà Lạt Square")).toBe("da lat square");
  });
});

describe("takeSoonestEventPerVenue", () => {
  it("keeps the soonest event for a venue id and counts the rest", () => {
    const result = takeSoonestEventPerVenue(
      [
        event({
          id: "later",
          venue_id: "venue-lulu",
          location_name: "Other room",
          starts_at: "2026-10-02T12:30:00.000Z",
        }),
        event({
          id: "soonest",
          venue_id: "venue-lulu",
          location_name: "LuLuLoLa Coffee+",
          starts_at: "2026-09-27T12:30:00.000Z",
        }),
        event({
          id: "middle",
          venue_id: "venue-lulu",
          starts_at: "2026-09-30T12:30:00.000Z",
        }),
      ],
      5,
    );

    expect(result.events.map((item) => item.id)).toEqual(["soonest"]);
    expect(result.moreAtVenueByEventId).toEqual({ soonest: 2 });
  });

  it("does not merge different venue ids that share a place name", () => {
    const result = takeSoonestEventPerVenue(
      [
        event({
          id: "a",
          venue_id: "venue-a",
          location_name: "Shared name",
          starts_at: "2026-09-28T12:00:00.000Z",
        }),
        event({
          id: "b",
          venue_id: "venue-b",
          location_name: "Shared name",
          starts_at: "2026-09-27T12:00:00.000Z",
        }),
      ],
      5,
    );

    expect(result.events.map((item) => item.id)).toEqual(["b", "a"]);
    expect(result.moreAtVenueByEventId).toEqual({});
  });

  it("falls back to a normalized place name when venue id is missing", () => {
    const result = takeSoonestEventPerVenue(
      [
        event({
          id: "punctuated",
          venue_id: "  ",
          location_name: "LuLuLoLa Coffee+",
          starts_at: "2026-10-01T12:30:00.000Z",
        }),
        event({
          id: "plain",
          venue_id: null,
          location_name: "lululola   coffee",
          starts_at: "2026-09-27T12:30:00.000Z",
        }),
      ],
      5,
    );

    expect(result.events.map((item) => item.id)).toEqual(["plain"]);
    expect(result.moreAtVenueByEventId).toEqual({ plain: 1 });
  });

  it("treats one coordinate cluster as the same named place", () => {
    const result = takeSoonestEventPerVenue(
      [
        event({
          id: "with-coords",
          location_name: "Mây Lang Thang",
          latitude: 11.94011,
          longitude: 108.45814,
          starts_at: "2026-10-03T10:00:00.000Z",
        }),
        event({
          id: "nearby",
          location_name: "May Lang Thang",
          latitude: 11.9404,
          longitude: 108.4584,
          starts_at: "2026-10-10T10:00:00.000Z",
        }),
        event({
          id: "no-coords",
          location_name: "Mây Lang Thang",
          starts_at: "2026-10-17T10:00:00.000Z",
        }),
      ],
      5,
    );

    expect(result.events.map((item) => item.id)).toEqual(["with-coords"]);
    expect(result.moreAtVenueByEventId).toEqual({ "with-coords": 2 });
  });

  it("keeps same-name events apart when coordinates are different places", () => {
    const result = takeSoonestEventPerVenue(
      [
        event({
          id: "north",
          location_name: "Cafe",
          latitude: 11.94,
          longitude: 108.45,
          starts_at: "2026-09-27T12:00:00.000Z",
        }),
        event({
          id: "south",
          location_name: "Cafe",
          latitude: 11.97,
          longitude: 108.48,
          starts_at: "2026-09-28T12:00:00.000Z",
        }),
        event({
          id: "unplaced",
          location_name: "Cafe",
          starts_at: "2026-09-29T12:00:00.000Z",
        }),
      ],
      5,
    );

    expect(result.events.map((item) => item.id)).toEqual([
      "north",
      "south",
      "unplaced",
    ]);
  });

  it("does not collapse events that have no venue at all", () => {
    const result = takeSoonestEventPerVenue(
      [
        event({ id: "one", starts_at: "2026-09-27T12:00:00.000Z" }),
        event({ id: "two", location_name: "   ", starts_at: "2026-09-28T12:00:00.000Z" }),
      ],
      5,
    );

    expect(result.events.map((item) => item.id)).toEqual(["one", "two"]);
    expect(result.moreAtVenueByEventId).toEqual({});
  });

  it("fills the limit with distinct venues before later repeats", () => {
    const lulu = Array.from({ length: 10 }, (_, index) =>
      event({
        id: `lulu-${index}`,
        venue_id: "venue-lulu",
        location_name: "LuLuLoLa Coffee+",
        starts_at: `2026-09-${String(27 + (index % 3)).padStart(2, "0")}T12:30:00.000Z`,
      }),
    );
    // Force a stable soonest: rewrite starts so index 0 is first, then repeats.
    lulu.forEach((item, index) => {
      const day = 27 + index;
      const month = day > 30 ? 10 : 9;
      const date = day > 30 ? day - 30 : day;
      item.starts_at = `2026-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}T12:30:00.000Z`;
    });

    const others = [
      event({
        id: "cherry",
        venue_id: "venue-cherry",
        location_name: "Dưới Tán Anh Đào",
        starts_at: "2026-09-27T13:00:00.000Z",
      }),
      event({
        id: "lam-vien",
        venue_id: "venue-lam-vien",
        location_name: "Quảng Trường Lâm Viên",
        starts_at: "2026-10-10T13:00:00.000Z",
      }),
    ];

    const input = [...lulu, ...others];
    const snapshot = input.map((item) => item.id);
    const result = takeSoonestEventPerVenue(input, 3);

    expect(result.events.map((item) => item.id)).toEqual([
      "lulu-0",
      "cherry",
      "lam-vien",
    ]);
    expect(result.moreAtVenueByEventId).toEqual({ "lulu-0": 9 });
    expect(input.map((item) => item.id)).toEqual(snapshot);
  });

  it("breaks equal start times by id and ignores a non-positive limit", () => {
    const tied = takeSoonestEventPerVenue(
      [
        event({ id: "b", venue_id: "venue-1", starts_at: "2026-09-27T12:00:00.000Z" }),
        event({ id: "a", venue_id: "venue-1", starts_at: "2026-09-27T12:00:00.000Z" }),
      ],
      2,
    );
    expect(tied.events.map((item) => item.id)).toEqual(["a"]);

    expect(takeSoonestEventPerVenue(tied.events, 0).events).toEqual([]);
  });
});
