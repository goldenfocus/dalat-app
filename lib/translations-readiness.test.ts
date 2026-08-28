import { describe, expect, it } from "vitest";
import { CONTENT_LOCALES, type ContentLocale } from "@/lib/types";
import {
  evaluateEventIndexingReadiness,
  evaluateEventIndexingReadinessBatch,
  eventLocalePath,
  type EventIndexingSource,
  type EventIndexingTranslationRow,
} from "./translations-readiness";

const EVENT_UPDATED_AT = "2026-08-27T12:00:00.000Z";
const TRANSLATION_UPDATED_AT = "2026-08-27T12:05:00.000Z";

function event(overrides: Partial<EventIndexingSource> = {}): EventIndexingSource {
  return {
    id: "event-1",
    slug: "flower-festival-2026",
    title: "Da Lat Flower Festival 2026",
    description:
      "A complete guide to the Da Lat Flower Festival programme, venues, transport, accessibility, tickets, and practical visitor information.",
    starts_at: "2026-12-19T12:00:00.000Z",
    ends_at: "2026-12-31T15:00:00.000Z",
    location_name: "Lam Vien Square",
    address: "Tran Quoc Toan Street, Ward 10, Da Lat",
    venue_id: null,
    is_online: false,
    online_link: null,
    image_url: null,
    tribe_id: null,
    tribe_visibility: "public",
    source_locale: "en",
    status: "published",
    updated_at: EVENT_UPDATED_AT,
    ...overrides,
  };
}

function translation(
  locale: ContentLocale,
  field: "title" | "description",
  overrides: Partial<EventIndexingTranslationRow> = {}
): EventIndexingTranslationRow {
  return {
    content_id: "event-1",
    target_locale: locale,
    field_name: field,
    translated_text:
      field === "title"
        ? `${locale} Da Lat Flower Festival 2026`
        : `${locale} Complete festival programme with confirmed venues, transport guidance, accessibility details, ticket information, and practical advice for visitors.`,
    updated_at: TRANSLATION_UPDATED_AT,
    ...overrides,
  };
}

function completeRows(eventId = "event-1"): EventIndexingTranslationRow[] {
  return CONTENT_LOCALES.filter((locale) => locale !== "en").flatMap((locale) => [
    translation(locale, "title", { content_id: eventId }),
    translation(locale, "description", { content_id: eventId }),
  ]);
}

describe("event translation indexing readiness", () => {
  it("exposes only the substantive source locale before translations exist", () => {
    const result = evaluateEventIndexingReadiness(event(), []);

    expect(result.readyLocales).toEqual(["en"]);
    expect(result.readyPaths).toEqual(["/events/flower-festival-2026"]);
    expect(result.allLocalesReady).toBe(false);
    expect(result.content).toMatchObject({
      ready: true,
      blockingIssues: [],
      warnings: ["missing_uploaded_image"],
      ogImageFallbackPath: "/events/flower-festival-2026/og-image",
    });
    expect(result.locales.find((locale) => locale.locale === "vi")).toMatchObject({
      ready: false,
      missingFields: ["title", "description"],
    });
  });

  it("uses locale-prefixed paths except for canonical root English", () => {
    expect(eventLocalePath("en", "demo")).toBe("/events/demo");
    expect(eventLocalePath("vi", "demo")).toBe("/vi/events/demo");
    expect(eventLocalePath("ja", "demo")).toBe("/ja/events/demo");
  });

  it("requires every non-empty source field and rejects placeholder-sized rows", () => {
    const result = evaluateEventIndexingReadiness(event(), [
      translation("vi", "title"),
      translation("vi", "description", { translated_text: "-" }),
    ]);
    const vietnamese = result.locales.find((locale) => locale.locale === "vi");

    expect(vietnamese).toMatchObject({
      ready: false,
      missingFields: [],
      nonSubstantiveFields: ["description"],
    });
  });

  it("keeps every locale out of the index when the source has no description", () => {
    const result = evaluateEventIndexingReadiness(
      event({ description: null }),
      [translation("vi", "title")]
    );

    expect(result.requiredFields).toEqual(["title", "description"]);
    expect(result.readyLocales).toEqual([]);
    expect(result.locales.find((locale) => locale.locale === "en")).toMatchObject({
      ready: false,
      translationReady: true,
      nonSubstantiveFields: [],
    });
    expect(result.content).toMatchObject({
      ready: false,
      blockingIssues: ["description_too_short"],
    });
  });

  it("keeps placeholder-short source descriptions out of every locale", () => {
    const result = evaluateEventIndexingReadiness(
      event({ description: "Details coming soon." }),
      completeRows()
    );

    expect(result.readyLocales).toEqual([]);
    expect(result.contentReady).toBe(false);
    expect(result.content.blockingIssues).toContain("description_too_short");
    expect(result.locales.find((locale) => locale.locale === "vi")?.translationReady)
      .toBe(true);
  });

  it("keeps source-content diagnostics separate from locale translation diagnostics", () => {
    const result = evaluateEventIndexingReadiness(
      event({ address: null, venue_id: null }),
      [translation("vi", "title"), translation("vi", "description")]
    );
    const vietnamese = result.locales.find((locale) => locale.locale === "vi");

    expect(result.content).toMatchObject({
      ready: false,
      blockingIssues: ["missing_physical_location"],
    });
    expect(vietnamese).toMatchObject({
      translationReady: true,
      missingFields: [],
      nonSubstantiveFields: [],
      ready: false,
    });
  });

  it("blocks every locale while source-language detection is pending", () => {
    const result = evaluateEventIndexingReadiness(
      event({ source_locale: null }),
      completeRows()
    );

    expect(result.contentReady).toBe(false);
    expect(result.content.blockingIssues).toContain("unknown_source_locale");
    expect(result.readyLocales).toEqual([]);
  });

  it("accepts a linked venue as public location backing", () => {
    const result = evaluateEventIndexingReadiness(
      event({ location_name: null, address: null, venue_id: "venue-1" }),
      []
    );

    expect(result.contentReady).toBe(true);
    expect(result.readyLocales).toEqual(["en"]);
  });

  it("requires online events to have a usable public URL", () => {
    const missing = evaluateEventIndexingReadiness(
      event({ is_online: true, online_link: "http://localhost:3000/secret" }),
      []
    );
    const publicEvent = evaluateEventIndexingReadiness(
      event({ is_online: true, online_link: "https://meet.example.com/flower-festival" }),
      []
    );

    expect(missing.content.blockingIssues).toContain("missing_public_online_link");
    expect(publicEvent.contentReady).toBe(true);
  });

  it("accepts valid future and archive dates but rejects inverted ranges", () => {
    const archived = evaluateEventIndexingReadiness(
      event({
        starts_at: "2021-12-01T12:00:00.000Z",
        ends_at: "2021-12-10T12:00:00.000Z",
      }),
      []
    );
    const inverted = evaluateEventIndexingReadiness(
      event({ ends_at: "2026-12-01T12:00:00.000Z" }),
      []
    );

    expect(archived.contentReady).toBe(true);
    expect(inverted.content.blockingIssues).toContain("invalid_end_date");
  });

  it("marks all 12 locales ready and propagates translation freshness", () => {
    const result = evaluateEventIndexingReadiness(event(), completeRows());

    expect(result.readyLocales).toEqual(CONTENT_LOCALES);
    expect(result.readyPaths).toHaveLength(12);
    expect(result.allLocalesReady).toBe(true);
    expect(result.lastModified).toBe(TRANSLATION_UPDATED_AT);
  });

  it("reports stale translations without invalidating them for unrelated event edits", () => {
    const result = evaluateEventIndexingReadiness(event(), [
      translation("vi", "title", { updated_at: "2026-08-27T11:00:00.000Z" }),
      translation("vi", "description", { updated_at: "2026-08-27T11:00:00.000Z" }),
    ]);
    const vietnamese = result.locales.find((locale) => locale.locale === "vi");

    expect(vietnamese).toMatchObject({
      ready: true,
      staleFields: ["title", "description"],
    });
  });

  it("never exposes a draft even when all translations are complete", () => {
    const result = evaluateEventIndexingReadiness(
      event({ status: "draft" }),
      completeRows()
    );

    expect(result.readyLocales).toEqual([]);
    expect(result.readyPaths).toEqual([]);
    expect(result.allLocalesReady).toBe(false);
  });

  it("never submits a members-only tribe event through service-role workers", () => {
    const result = evaluateEventIndexingReadiness(
      event({ tribe_id: "tribe-1", tribe_visibility: "members_only" }),
      completeRows()
    );

    expect(result.content.blockingIssues).toContain("not_publicly_discoverable");
    expect(result.readyPaths).toEqual([]);
  });

  it("uses the declared non-English source locale without requiring a copy row", () => {
    const result = evaluateEventIndexingReadiness(
      event({ source_locale: "vi" }),
      []
    );

    expect(result.readyLocales).toEqual(["vi"]);
    expect(result.readyPaths).toEqual(["/vi/events/flower-festival-2026"]);
  });

  it("groups bulk rows by event without cross-contaminating coverage", () => {
    const second = event({
      id: "event-2",
      slug: "coffee-workshop",
      description:
        "Join a detailed coffee workshop covering bean selection, roasting, brewing methods, tasting notes, equipment, and practical techniques.",
    });
    const rows = [
      translation("vi", "title"),
      translation("vi", "description"),
      translation("ko", "title", { content_id: "event-2" }),
      translation("ko", "description", { content_id: "event-2" }),
    ];
    const results = evaluateEventIndexingReadinessBatch([event(), second], rows);

    expect(results.get("event-1")?.readyLocales).toEqual(["en", "vi"]);
    expect(results.get("event-2")?.readyLocales).toEqual(["en", "ko"]);
  });
});
