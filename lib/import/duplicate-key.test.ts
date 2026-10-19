import { describe, expect, it } from "vitest";
import {
  isDuplicateOf,
  normalizeDuplicateTitle,
  sameVenue,
  titlesSimilar,
} from "./duplicate-key";

const mlt = "a340582a-52b9-4929-9275-b7340babf50e";

describe("normalizeDuplicateTitle", () => {
  it.each([
    ["PHƯƠNG LINH - ĐÀ LẠT | 13/11/2026", "phuong linh da lat"],
    ["PHƯƠNG LINH - ĐÀ LẠT", "phuong linh da lat"],
    ["Trung Quân - Đà Lạt - 28/11", "trung quan da lat"],
    ["Hà Nhi (07.11)", "ha nhi"],
    ["Jazz Night [13-11-26]", "jazz night"],
    ["Đêm nhạc 13/11/2026", "dem nhac"],
  ])("%s", (input, want) => {
    expect(normalizeDuplicateTitle(input)).toBe(want);
  });

  it("keeps numbers that are not date suffixes", () => {
    expect(normalizeDuplicateTitle("Festival 2026")).toBe("festival 2026");
  });
});

describe("isDuplicateOf", () => {
  const published = {
    id: "pub",
    title: "PHƯƠNG LINH - ĐÀ LẠT",
    starts_at: "2026-11-13 10:00:00+00",
    venue_id: mlt,
    location_name:
      "MÂY LANG THANG - 519 Thôn Măng Lin, Phường Lang Biang - Đà Lạt",
  };
  const nextix = {
    id: "draft",
    title: "PHƯƠNG LINH - ĐÀ LẠT | 13/11/2026",
    starts_at: "2026-11-13T10:00:00Z",
    venue_id: null,
    location_name: "Mây Lang Thang",
  };

  it("catches the nextix re-ingest of a maylangthang show", () => {
    expect(isDuplicateOf(nextix, published)).toBe(true);
  });

  it("catches the Trung Quân pair", () => {
    expect(
      isDuplicateOf(
        {
          id: "d",
          title: "TRUNG QUÂN - ĐÀ LẠT | 28/11/2026",
          starts_at: "2026-11-28T10:00:00Z",
          venue_id: null,
          location_name: "Mây Lang Thang",
        },
        {
          id: "p",
          title: "TRUNG QUÂN - ĐÀ LẠT",
          starts_at: "2026-11-28 10:00:00+00",
          venue_id: mlt,
          location_name: "MÂY LANG THANG - 519 Thôn Măng Lin",
        },
      ),
    ).toBe(true);
  });

  it("same venue + same time + similar (not identical) title", () => {
    expect(
      isDuplicateOf(
        {
          id: "d",
          title: "Phương Linh live tại Đà Lạt",
          starts_at: "2026-11-13T10:00:00Z",
          venue_id: mlt,
          location_name: null,
        },
        { ...published, title: "Phương Linh - Đà Lạt live" },
      ),
    ).toBe(true);
  });

  it("different artists at the same venue and time are not duplicates", () => {
    expect(
      isDuplicateOf(
        { ...nextix, title: "HÀ NHI - ĐÀ LẠT | 13/11/2026" },
        published,
      ),
    ).toBe(false);
  });

  it("same artist at a different time is not a duplicate unless the title is identical", () => {
    expect(
      isDuplicateOf(
        {
          ...nextix,
          title: "Phương Linh live",
          starts_at: "2026-11-13T13:00:00Z",
        },
        published,
      ),
    ).toBe(false);
  });

  it("never matches itself", () => {
    expect(isDuplicateOf(published, published)).toBe(false);
  });
});

describe("helpers", () => {
  it("venue strings with address detail match the bare venue", () => {
    expect(
      sameVenue(
        { venue_id: null, location_name: "Mây Lang Thang" },
        { venue_id: mlt, location_name: "MÂY LANG THANG - 519 Thôn Măng Lin" },
      ),
    ).toBe(true);
    expect(
      sameVenue(
        { venue_id: null, location_name: "VCafe" },
        { venue_id: null, location_name: "Mây Lang Thang" },
      ),
    ).toBe(false);
  });
  it("titlesSimilar ignores accents and date suffixes", () => {
    expect(
      titlesSimilar("Trung Quan - Da Lat (28.11)", "TRUNG QUÂN - ĐÀ LẠT"),
    ).toBe(true);
  });
});
