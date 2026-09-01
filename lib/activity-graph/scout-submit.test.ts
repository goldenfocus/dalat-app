import { describe, expect, it, vi } from "vitest";

vi.mock("./ingest", () => ({ ingestVerifiedActivity: vi.fn() }));

import { validateScoutSubmission, type ScoutSubmission } from "./scout-submit";

const NOW = new Date("2026-08-30T00:00:00.000Z");
const PAGE = "Autumn yoga retreat 2026-09-10 09:00 Da Lat, Lam Dong Public enrollment is open. Community yoga every Tuesday at 18:00.";

function submission(): ScoutSubmission {
  return {
    source: {
      name: "Example Yoga Da Lat",
      canonicalUrl: "https://example.test",
      discoveryUrl: "https://example.test/courses",
      pagePathPrefix: "/courses",
    },
    activity: {
      sourceUid: "https://example.test/courses/autumn-yoga",
      sourceUrl: "https://example.test/courses/autumn-yoga",
      kind: "workshop",
      title: "Autumn yoga retreat",
      description: null,
      startsAt: "2026-09-10T09:00:00+07:00",
      endsAt: "2026-09-10T11:00:00+07:00",
      timePrecision: "exact",
      rrule: null,
      startsAtTime: null,
      durationMinutes: 120,
      firstOccurrence: null,
      rruleUntil: null,
      locationName: "Da Lat",
      address: "Da Lat, Lam Dong",
      latitude: null,
      longitude: null,
      organizerName: "Example Yoga Da Lat",
      organizerUrl: "https://example.test",
      priceType: "paid",
      ticketTiers: null,
      ticketUrl: "https://example.test/courses/autumn-yoga",
      reservationRequirement: "required",
      publicAccess: "confirmed",
      sourcePublishedAt: null,
      sourceUpdatedAt: null,
      eventStatus: "scheduled",
      evidence: [
        { fieldPath: "title", rawValue: "Autumn yoga retreat", evidenceText: "Autumn yoga retreat", locator: "body", confidence: 100 },
        { fieldPath: "starts_at", rawValue: "2026-09-10 09:00", evidenceText: "2026-09-10 09:00", locator: "body", confidence: 100 },
        { fieldPath: "address", rawValue: "Da Lat, Lam Dong", evidenceText: "Da Lat, Lam Dong", locator: "body", confidence: 100 },
        { fieldPath: "public_access", rawValue: "Public enrollment is open", evidenceText: "Public enrollment is open", locator: "body", confidence: 100 },
      ],
      structuredPayload: {},
      attributes: {},
    },
  };
}

describe("autonomous scout submission validation", () => {
  it("accepts a first-party, future, fully evidenced activity", () => {
    expect(validateScoutSubmission(submission(), PAGE, NOW).activity.title).toBe("Autumn yoga retreat");
  });

  it("rejects a cross-origin activity page", () => {
    const input = submission();
    input.activity.sourceUrl = "https://tickets.example.test/autumn-yoga";
    expect(() => validateScoutSubmission(input, PAGE, NOW)).toThrow("same-origin");
  });

  it("rejects private social sources even when the URLs agree", () => {
    const input = submission();
    input.source.canonicalUrl = "https://www.facebook.com/example";
    input.source.discoveryUrl = "https://www.facebook.com/example/events";
    input.activity.sourceUrl = "https://www.facebook.com/example/events/1";
    expect(() => validateScoutSubmission(input, PAGE, NOW)).toThrow("Private or login-gated social");
  });

  it("rejects any evidence quote that is not present in the page", () => {
    const input = submission();
    input.activity.evidence[0].evidenceText = "Invented title";
    expect(() => validateScoutSubmission(input, PAGE, NOW)).toThrow("Evidence is not present");
  });

  it("rejects a past or imprecise occurrence before it can enter the graph", () => {
    const input = submission();
    input.activity.startsAt = "2026-08-29T09:00:00+07:00";
    expect(() => validateScoutSubmission(input, PAGE, NOW)).toThrow("future occurrence");
    input.activity.startsAt = "2026-09-10T09:00:00+07:00";
    input.activity.timePrecision = "date_only";
    expect(() => validateScoutSubmission(input, PAGE, NOW)).toThrow("exact future start time");
  });

  it("accepts a fully evidenced recurring activity without inventing a dated start", () => {
    const input = submission();
    input.activity.sourceUid = "https://example.test/courses/community-yoga";
    input.activity.sourceUrl = "https://example.test/courses/community-yoga";
    input.activity.kind = "recurring_activity";
    input.activity.title = "Community yoga";
    input.activity.startsAt = null;
    input.activity.endsAt = null;
    input.activity.timePrecision = "recurring";
    input.activity.rrule = "FREQ=WEEKLY;BYDAY=TU";
    input.activity.startsAtTime = "18:00:00";
    input.activity.firstOccurrence = "2026-08-04";
    input.activity.evidence = [
      { fieldPath: "title", rawValue: "Community yoga", evidenceText: "Community yoga", locator: "body", confidence: 100 },
      { fieldPath: "rrule", rawValue: "FREQ=WEEKLY;BYDAY=TU", evidenceText: "every Tuesday", locator: "body", confidence: 100 },
      { fieldPath: "starts_at_time", rawValue: "18:00", evidenceText: "18:00", locator: "body", confidence: 100 },
      { fieldPath: "address", rawValue: "Da Lat, Lam Dong", evidenceText: "Da Lat, Lam Dong", locator: "body", confidence: 100 },
      { fieldPath: "public_access", rawValue: "Public enrollment is open", evidenceText: "Public enrollment is open", locator: "body", confidence: 100 },
    ];

    expect(validateScoutSubmission(input, PAGE, NOW).activity.rrule).toBe("FREQ=WEEKLY;BYDAY=TU");
  });

  it("rejects recurring activities with incomplete or expired schedules", () => {
    const input = submission();
    input.activity.kind = "recurring_activity";
    input.activity.startsAt = null;
    input.activity.endsAt = null;
    input.activity.timePrecision = "recurring";
    input.activity.rrule = "FREQ=WEEKLY;BYDAY=TU";
    input.activity.startsAtTime = "18:00:00";
    input.activity.firstOccurrence = "2026-08-04";
    input.activity.rruleUntil = "2026-08-29T23:59:59+07:00";
    input.activity.evidence = [
      { fieldPath: "title", rawValue: "Community yoga", evidenceText: "Community yoga", locator: "body", confidence: 100 },
      { fieldPath: "rrule", rawValue: "FREQ=WEEKLY;BYDAY=TU", evidenceText: "every Tuesday", locator: "body", confidence: 100 },
      { fieldPath: "starts_at_time", rawValue: "18:00", evidenceText: "18:00", locator: "body", confidence: 100 },
      { fieldPath: "address", rawValue: "Da Lat, Lam Dong", evidenceText: "Da Lat, Lam Dong", locator: "body", confidence: 100 },
      { fieldPath: "public_access", rawValue: "Public enrollment is open", evidenceText: "Public enrollment is open", locator: "body", confidence: 100 },
    ];

    expect(() => validateScoutSubmission(input, PAGE, NOW)).toThrow("future occurrence");
    input.activity.rruleUntil = null;
    input.activity.evidence = input.activity.evidence.filter((row) => row.fieldPath !== "starts_at_time");
    expect(() => validateScoutSubmission(input, PAGE, NOW)).toThrow("recurring schedule evidence");
  });

  it("rejects a fully evidenced activity beyond the near-term discovery window", () => {
    const input = submission();
    input.activity.startsAt = "2027-03-10T09:00:00+07:00";
    expect(() => validateScoutSubmission(input, PAGE, NOW)).toThrow("next 45 days");
  });
});
