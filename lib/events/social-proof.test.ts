import { describe, it, expect } from "vitest";
import {
  MIN_VISIBLE_GOING,
  shouldShowGoingCount,
  getCardCoverUrl,
  getPastProof,
  type EventSocial,
} from "./social-proof";

const social = (o: Partial<EventSocial> = {}): EventSocial => ({
  event_id: "e1",
  fallback_image_url: null,
  fallback_photo_credit: null,
  last_occurrence_went: null,
  last_occurrence_photos: null,
  ...o,
});

describe("shouldShowGoingCount", () => {
  it("hides counts below threshold (the '0 going' killer)", () => {
    expect(shouldShowGoingCount(0)).toBe(false);
    expect(shouldShowGoingCount(2)).toBe(false);
  });
  it("shows counts at/above threshold", () => {
    expect(shouldShowGoingCount(MIN_VISIBLE_GOING)).toBe(true);
    expect(shouldShowGoingCount(12)).toBe(true);
  });
  it("treats undefined counts as hidden", () => {
    expect(shouldShowGoingCount(undefined)).toBe(false);
  });
});

describe("getCardCoverUrl", () => {
  it("prefers a real uploaded image", () => {
    expect(
      getCardCoverUrl(
        "https://cdn.dalat.app/event-media/x.jpg",
        social({ fallback_image_url: "https://cdn.dalat.app/moments/y.jpg" })
      )
    ).toBe("https://cdn.dalat.app/event-media/x.jpg");
  });
  it("falls back to the past-occurrence moment", () => {
    expect(
      getCardCoverUrl(
        null,
        social({ fallback_image_url: "https://cdn.dalat.app/moments/y.jpg" })
      )
    ).toBe("https://cdn.dalat.app/moments/y.jpg");
  });
  it("returns null when nothing available (card shows default art)", () => {
    expect(getCardCoverUrl(null, social())).toBeNull();
    expect(getCardCoverUrl(null, undefined)).toBeNull();
  });
  it("does not treat the default-image url as a custom image", () => {
    expect(
      getCardCoverUrl("/images/defaults/event-default-desktop.png", social())
    ).toBeNull();
  });
});

describe("getPastProof", () => {
  it("returns both stats when both are meaningful", () => {
    expect(
      getPastProof(social({ last_occurrence_went: 12, last_occurrence_photos: 40 }))
    ).toEqual({ kind: "both", went: 12, photos: 40 });
  });
  it("photos-only when went is small", () => {
    expect(
      getPastProof(social({ last_occurrence_went: 2, last_occurrence_photos: 40 }))
    ).toEqual({ kind: "photos", went: 2, photos: 40 });
  });
  it("went-only when no photos", () => {
    expect(
      getPastProof(social({ last_occurrence_went: 12, last_occurrence_photos: 0 }))
    ).toEqual({ kind: "went", went: 12, photos: 0 });
  });
  it("null when nothing meaningful", () => {
    expect(
      getPastProof(social({ last_occurrence_went: 1, last_occurrence_photos: 0 }))
    ).toBeNull();
    expect(getPastProof(social())).toBeNull();
    expect(getPastProof(undefined)).toBeNull();
  });
});
