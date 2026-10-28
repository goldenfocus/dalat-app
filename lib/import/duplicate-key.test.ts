import { describe, expect, it } from "vitest";
import {
  isDuplicateOf,
  isSeriesInstanceDuplicate,
  normalizeDuplicateTitle,
  sameVenue,
  seriesVenueKey,
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

describe("isSeriesInstanceDuplicate", () => {
  // Review: wa-3a1ed7fe81ad8773c956 vs language-exchange-social-house-z8oc-20261028.
  const draft = {
    id: "788cbc2e-48c5-45b6-b575-ebcc97714fd5",
    title: "Event at Socialhouse Coffee",
    starts_at: "2026-10-28T11:00:00+00:00",
    ends_at: "2026-10-28T13:00:00+00:00",
    venue_id: null,
    location_name: "Socialhouse Coffee",
  };
  const instance = {
    id: "171fa31b-4040-4ec3-a7cf-58e6f17dc096",
    title: "Language Exchange @ Social House",
    starts_at: "2026-10-28T11:00:00+00:00",
    ends_at: "2026-10-28T13:00:00+00:00",
    series_id: "ad0a0c5e-f718-447c-89f1-6fa3b78e3c52",
    venue_id: "436f8b46-d5fe-41ef-8245-e8ffb9ee7980",
    location_name:
      "184 Đ. Tô Ngọc Vân, Xuân Hương - Đà Lạt, Lâm Đồng 66122, Vietnam",
    venue_name: "Social House Dalat",
  };

  it("matches the WhatsApp Socialhouse post to the weekly series instance", () => {
    expect(isDuplicateOf(draft, instance)).toBe(false);
    expect(seriesVenueKey("Socialhouse Coffee")).toBe("socialhouse");
    expect(seriesVenueKey("Social House Dalat")).toBe("socialhouse");
    expect(isSeriesInstanceDuplicate(draft, instance)).toBe(true);
    expect(
      isSeriesInstanceDuplicate(
        { ...draft, starts_at: "2026-10-28T11:30:00+00:00", ends_at: null },
        instance,
      ),
    ).toBe(true);
  });

  it("requires a series instance, the same date, slot and venue", () => {
    expect(
      isSeriesInstanceDuplicate(draft, { ...instance, series_id: null }),
    ).toBe(false);
    expect(
      isSeriesInstanceDuplicate(draft, {
        ...instance,
        starts_at: "2026-10-29T11:00:00+00:00",
        ends_at: "2026-10-29T13:00:00+00:00",
      }),
    ).toBe(false);
    expect(
      isSeriesInstanceDuplicate(
        {
          ...draft,
          starts_at: "2026-10-28T14:00:00+00:00",
          ends_at: "2026-10-28T15:00:00+00:00",
        },
        instance,
      ),
    ).toBe(false);
    expect(
      isSeriesInstanceDuplicate(
        { ...draft, location_name: "Nghiêm Brewing Đà Lạt" },
        instance,
      ),
    ).toBe(false);
    expect(
      isSeriesInstanceDuplicate(
        {
          ...draft,
          venue_id: "another-venue",
          location_name: "Socialhouse Coffee",
        },
        instance,
      ),
    ).toBe(false);
    expect(
      isSeriesInstanceDuplicate(
        { ...draft, venue_id: instance.venue_id, location_name: null },
        instance,
      ),
    ).toBe(true);
  });
});
