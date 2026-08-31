import { describe, expect, it } from "vitest";
import {
  evaluateDalatLocality,
  freshnessScore,
  scoreActivity,
  scoreEventDuplicate,
} from "./scoring";
import type { ActivitySource, ExtractedActivity } from "./types";

const source: ActivitySource = {
  id: "source-1",
  slug: "official",
  name: "Official venue",
  canonical_url: "https://venue.example",
  discovery_url: "https://venue.example/sitemap.xml",
  page_path_prefix: "/shows/",
  source_kind: "first_party_venue",
  fetch_mode: "json_ld_sitemap",
  access_basis: "first_party_page",
  trust_tier: 1,
  policy_status: "approved",
  crawl_interval_minutes: 60,
  max_items_per_run: 25,
  status: "active",
  auto_publish_enabled: true,
  auto_publish_threshold: 95,
  organizer_id: null,
  venue_id: null,
  metadata: {},
};

const activity: ExtractedActivity = {
  sourceUid: "https://venue.example/shows/a",
  sourceUrl: "https://venue.example/shows/a",
  kind: "performance",
  title: "Đêm nhạc Đà Lạt",
  description: null,
  startsAt: "2026-09-02T12:30:00.000Z",
  endsAt: "2026-09-02T14:30:00.000Z",
  timezone: "Asia/Ho_Chi_Minh",
  timePrecision: "exact",
  rrule: null,
  startsAtTime: null,
  durationMinutes: 120,
  firstOccurrence: null,
  rruleUntil: null,
  locationName: "Mây Lang Thang - Đà Lạt",
  address: "Đà Lạt, Lâm Đồng",
  latitude: null,
  longitude: null,
  organizerName: "Mây Lang Thang",
  organizerUrl: "https://venue.example",
  priceType: "paid",
  ticketTiers: [{ name: "Official", price: 250000, currency: "VND" }],
  ticketUrl: "https://venue.example/shows/a",
  reservationRequirement: "required",
  publicAccess: "confirmed",
  sourcePublishedAt: null,
  sourceUpdatedAt: "2026-08-28T00:00:00.000Z",
  eventStatus: "scheduled",
  evidence: [
    {
      fieldPath: "title",
      rawValue: "Đêm nhạc Đà Lạt",
      locator: "name",
      confidence: 100,
    },
    {
      fieldPath: "starts_at",
      rawValue: "2026-09-02",
      locator: "start",
      confidence: 100,
    },
    {
      fieldPath: "address",
      rawValue: "Đà Lạt",
      locator: "address",
      confidence: 100,
    },
    {
      fieldPath: "event_status",
      rawValue: "scheduled",
      locator: "status",
      confidence: 100,
    },
  ],
  structuredPayload: {},
  attributes: {},
};

describe("Activity Graph scoring", () => {
  it("clears automatic publication gates only for complete official evidence", () => {
    const locality = evaluateDalatLocality(activity);
    const result = scoreActivity(
      activity,
      source,
      locality,
      new Date("2026-08-28T00:00:00Z"),
    );
    expect(locality.status).toBe("confirmed");
    expect(result.score).toBe(100);
    expect(result.hardGateFailures).toEqual([]);
  });

  it("allows a server-verified scout submission to reach its 97-point threshold", () => {
    const scoutSource = { ...source, fetch_mode: "manual", auto_publish_threshold: 97 };
    const result = scoreActivity(
      activity,
      scoutSource,
      evaluateDalatLocality(activity),
      new Date("2026-08-28T00:00:00Z"),
    );
    expect(result.score).toBe(100);
    expect(result.hardGateFailures).toEqual([]);
  });

  it("does not treat the widened Lâm Đồng province as Đà Lạt", () => {
    expect(
      evaluateDalatLocality({
        ...activity,
        locationName: "Lâm Đồng",
        address: "Lâm Đồng",
      }).status,
    ).toBe("unknown");
    expect(
      evaluateDalatLocality({
        ...activity,
        locationName: "Mũi Né",
        address: "Phan Thiết, Lâm Đồng",
      }).status,
    ).toBe("outside");
  });

  it("rejects a touring city before considering stray Đà Lạt text", () => {
    expect(
      evaluateDalatLocality({
        ...activity,
        locationName: "SOL 8 | HÀ NỘI",
        address: "Hà Nội · tour promoted from Đà Lạt",
      }),
    ).toMatchObject({
      status: "outside",
      reason: expect.stringContaining("ha noi"),
    });
  });

  it("withholds exact-looking events when public access is unknown", () => {
    const uncertain = { ...activity, publicAccess: "unknown" as const };
    const result = scoreActivity(
      uncertain,
      source,
      evaluateDalatLocality(uncertain),
      new Date("2026-08-28T00:00:00Z"),
    );
    expect(result.hardGateFailures).toContain("public_access_unconfirmed");
  });

  it("uses an exponential confirmation half-life", () => {
    expect(
      freshnessScore(
        "2026-08-21T00:00:00Z",
        7,
        1,
        new Date("2026-08-28T00:00:00Z"),
      ),
    ).toBe(50);
  });

  it("classifies exact title, time and venue as the same occurrence", () => {
    const match = scoreEventDuplicate(
      activity,
      {
        id: "event-1",
        title: "Dem nhac Da Lat",
        starts_at: activity.startsAt!,
        location_name: "May Lang Thang Da Lat",
        address: "Da Lat, Lam Dong",
        organizer_id: "org-1",
        external_chat_url: activity.sourceUrl,
      },
      "org-1",
    );
    expect(match.classification).toBe("same_occurrence");
    expect(match.score).toBeGreaterThanOrEqual(90);
  });
});
