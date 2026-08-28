import { describe, expect, it } from "vitest";
import type { ExtractedActivity } from "./types";
import {
  activityDescriptionForLocale,
  activitySeriesDescriptionForLocale,
  sourceDescriptionForLocale,
} from "./translations";

const activity: ExtractedActivity = {
  sourceUid: "nightly-acoustic",
  sourceUrl: "https://duoitananhdao.com/en/",
  kind: "recurring_activity",
  title: "Live Acoustic • Dưới Tán Anh Đào",
  description: null,
  startsAt: null,
  endsAt: null,
  timezone: "Asia/Ho_Chi_Minh",
  timePrecision: "recurring",
  rrule: "FREQ=DAILY",
  startsAtTime: "19:30:00",
  durationMinutes: 120,
  firstOccurrence: "2026-08-28",
  rruleUntil: null,
  locationName: "Dưới Tán Anh Đào",
  address: "29B Hùng Vương, Đà Lạt",
  latitude: null,
  longitude: null,
  organizerName: "Dưới Tán Anh Đào",
  organizerUrl: "https://duoitananhdao.com/en/",
  priceType: null,
  ticketTiers: null,
  ticketUrl: "https://duoitananhdao.com/en/",
  reservationRequirement: "recommended",
  publicAccess: "confirmed",
  sourcePublishedAt: null,
  sourceUpdatedAt: null,
  eventStatus: "scheduled",
  evidence: [],
  structuredPayload: {},
  attributes: { no_cover_charge: true, rain_suitable: true },
};

describe("sourceDescriptionForLocale", () => {
  it("uses the requested supported locale", () => {
    expect(sourceDescriptionForLocale("en", "Dưới Tán Anh Đào")).toContain(
      "Verified from",
    );
    expect(sourceDescriptionForLocale("vi", "Dưới Tán Anh Đào")).toContain(
      "Đã xác minh",
    );
  });

  it("falls back to English for an unknown locale", () => {
    expect(sourceDescriptionForLocale("unknown", "Official Source")).toContain(
      "Verified from",
    );
  });

  it("composes a useful localized summary only from evidenced facts", () => {
    const en = activityDescriptionForLocale("en", activity, "Dưới Tán Anh Đào");
    const vi = activityDescriptionForLocale("vi", activity, "Dưới Tán Anh Đào");

    expect(en).toContain("runs daily");
    expect(en).toContain("19:30");
    expect(en).toContain("no ticket or cover charge");
    expect(en).toContain("moves indoors");
    expect(vi).toContain("diễn ra hằng ngày");
    expect(vi).toContain("Nên đặt chỗ trước");
  });

  it("keeps recurring-series pages as rich as their occurrences", () => {
    const description = activitySeriesDescriptionForLocale(
      "en",
      {
        title: activity.title,
        starts_at_time: activity.startsAtTime!,
        duration_minutes: activity.durationMinutes!,
        location_name: activity.locationName,
        address: activity.address,
        reservation_requirement: activity.reservationRequirement,
        source_metadata: {
          activity_attributes: activity.attributes,
        },
      },
      "Dưới Tán Anh Đào",
    );

    expect(description).toContain("runs daily");
    expect(description).toContain("no ticket or cover charge");
    expect(description).toContain("moves indoors");
  });
});
