import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventSeries } from "@/lib/types";
import { projectActivity } from "./project";
import type {
  ActivitySource,
  ConfidenceResult,
  ExtractedActivity,
  LocalityResult,
} from "./types";

type Filter = { method: "eq" | "gte" | "in"; column: string; value: unknown };
type Write = {
  table: string;
  method: "update" | "insert" | "upsert";
  values: Record<string, unknown> | Array<Record<string, unknown>>;
  filters: Filter[];
};

const KEEP_ID = "11111111-1111-4111-8111-111111111111";
const OBSOLETE_ID = "22222222-2222-4222-8222-222222222222";
const SERIES_ID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  pingIndexNow: vi.fn(),
  upsertTranslations: vi.fn(),
}));

vi.mock("@/lib/seo/indexnow", () => ({ pingIndexNow: mocks.pingIndexNow }));
vi.mock("@/lib/i18n/routing", () => ({ locales: ["en", "vi"] }));
vi.mock("./translations", () => ({
  sourceDescription: () => "Verified source summary",
  upsertActivityEventTranslations: mocks.upsertTranslations,
}));

const source: ActivitySource = {
  id: "44444444-4444-4444-8444-444444444444",
  slug: "official-source",
  name: "Official Source",
  canonical_url: "https://example.com",
  discovery_url: "https://example.com/sitemap.xml",
  page_path_prefix: "/activities/",
  source_kind: "first_party_venue",
  fetch_mode: "verified_recurring_page",
  access_basis: "first_party_page",
  trust_tier: 1,
  policy_status: "approved",
  crawl_interval_minutes: 60,
  max_items_per_run: 25,
  status: "active",
  auto_publish_enabled: true,
  auto_publish_threshold: 95,
  organizer_id: "55555555-5555-4555-8555-555555555555",
  venue_id: "66666666-6666-4666-8666-666666666666",
  metadata: {},
};

const activity: ExtractedActivity = {
  sourceUid: "weekly-acoustic",
  sourceUrl: "https://example.com/activities/acoustic",
  kind: "recurring_activity",
  title: "Saturday acoustic at the new venue",
  description: null,
  startsAt: null,
  endsAt: null,
  timezone: "Asia/Ho_Chi_Minh",
  timePrecision: "recurring",
  rrule: "FREQ=WEEKLY;BYDAY=SA",
  startsAtTime: "20:00:00",
  durationMinutes: 90,
  firstOccurrence: "2026-08-29",
  rruleUntil: null,
  locationName: "New Official Venue",
  address: "2 New Street, Đà Lạt",
  latitude: 11.95,
  longitude: 108.44,
  organizerName: "Official Source",
  organizerUrl: "https://example.com",
  priceType: "paid",
  ticketTiers: null,
  ticketUrl: "https://example.com/book",
  reservationRequirement: "required",
  publicAccess: "confirmed",
  sourcePublishedAt: null,
  sourceUpdatedAt: "2026-08-28T09:00:00.000Z",
  eventStatus: "scheduled",
  evidence: [
    {
      fieldPath: "title",
      rawValue: "Saturday acoustic at the new venue",
      locator: "jsonld:name",
      confidence: 100,
    },
  ],
  structuredPayload: {},
  attributes: {},
};

const locality: LocalityResult = {
  status: "confirmed",
  confidence: 100,
  reason: "Explicitly Đà Lạt",
};

const confidence: ConfidenceResult = {
  score: 100,
  components: {},
  penalties: {},
  hardGateFailures: [],
};

function existingSeries(
  sourcePlatform: string | null = "activity-graph",
): EventSeries {
  return {
    id: SERIES_ID,
    slug: "old-nightly-acoustic",
    title: "Old nightly acoustic",
    description: "Old description",
    image_url: null,
    location_name: "Old Venue",
    address: "1 Old Street",
    google_maps_url: null,
    latitude: null,
    longitude: null,
    external_chat_url: "https://example.com/old",
    timezone: "Asia/Ho_Chi_Minh",
    capacity: null,
    is_online: false,
    online_link: null,
    title_position: "bottom",
    image_fit: "cover",
    focal_point: null,
    price_type: null,
    ticket_tiers: null,
    tribe_id: null,
    organizer_id: null,
    venue_id: null,
    created_by: "77777777-7777-4777-8777-777777777777",
    rrule: "FREQ=DAILY",
    starts_at_time: "19:30:00",
    duration_minutes: 120,
    first_occurrence: "2026-08-01",
    rrule_until: null,
    rrule_count: null,
    status: "active",
    instances_generated_until: "2026-10-28T00:00:00.000Z",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    source_platform: sourcePlatform,
    source_metadata: { old_observation: true },
    activity_kind: "recurring_activity",
    public_access: "confirmed",
    reservation_requirement: "recommended",
    last_checked_at: "2026-08-27T00:00:00.000Z",
    last_confirmed_at: "2026-08-27T00:00:00.000Z",
    source_updated_at: null,
    freshness_score: 90,
  };
}

function linkedSeriesClient(
  options: { sourcePlatform?: string | null; failInsert?: boolean; curated?: boolean } = {},
) {
  const series = existingSeries(
    Object.hasOwn(options, "sourcePlatform")
      ? (options.sourcePlatform ?? null)
      : "activity-graph",
  );
  if (options.curated) {
    series.image_url = "https://cdn.dalat.app/event-materials/activity-graph/yoga/hero.jpg";
    series.source_metadata = {
      activity_media_url: series.image_url,
      activity_media_provenance: "ai_generated",
      activity_media_alt: "AI-generated illustration of yoga; not an actual event photo.",
      activity_media_caption: "AI-generated illustration; not an actual event photo.",
      activity_media_gallery: ["https://cdn.dalat.app/event-materials/activity-graph/yoga/promo.jpg"],
    };
  }
  const writes: Write[] = [];
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: { published: true }, error: null });
  const from = vi.fn((table: string) => {
    let selected = "";
    let write: Write | null = null;
    const builder: Record<string, ReturnType<typeof vi.fn>> & {
      then?: (resolve: (value: unknown) => unknown) => Promise<unknown>;
    } = {};
    builder.select = vi.fn((columns: string) => {
      selected = columns;
      return builder;
    });
    builder.eq = vi.fn((column: string, value: unknown) => {
      write?.filters.push({ method: "eq", column, value });
      return builder;
    });
    builder.gte = vi.fn((column: string, value: unknown) => {
      write?.filters.push({ method: "gte", column, value });
      return builder;
    });
    builder.in = vi.fn((column: string, value: unknown) => {
      write?.filters.push({ method: "in", column, value });
      return builder;
    });
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.update = vi.fn((values: Record<string, unknown>) => {
      write = { table, method: "update", values, filters: [] };
      writes.push(write);
      return builder;
    });
    builder.insert = vi.fn((values: Array<Record<string, unknown>>) => {
      write = { table, method: "insert", values, filters: [] };
      writes.push(write);
      return builder;
    });
    builder.upsert = vi.fn(
      (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
        write = { table, method: "upsert", values, filters: [] };
        writes.push(write);
        return builder;
      },
    );
    builder.maybeSingle = vi.fn(async () => {
      if (table === "activity_canonical_links") {
        return {
          data: { event_id: null, event_series_id: SERIES_ID },
          error: null,
        };
      }
      if (table === "event_series") return { data: series, error: null };
      return { data: null, error: null };
    });
    builder.then = (resolve) => {
      if (
        ["insert", "upsert"].includes(write?.method ?? "") &&
        table === "events" &&
        options.failInsert
      ) {
        return Promise.resolve({
          data: null,
          error: { message: "insert unavailable" },
        }).then(resolve);
      }
      if (table === "events" && !write) {
        if (selected === "id,series_instance_date,is_exception,starts_at") {
          return Promise.resolve({
            data: [
              {
                id: KEEP_ID,
                series_instance_date: "2026-08-29",
                is_exception: false,
                starts_at: "2026-08-29T12:30:00.000Z",
              },
              {
                id: OBSOLETE_ID,
                series_instance_date: "2026-08-30",
                is_exception: false,
                starts_at: "2026-08-30T12:30:00.000Z",
              },
            ],
            error: null,
          }).then(resolve);
        }
        if (selected === "series_instance_date") {
          return Promise.resolve({
            data: [
              { series_instance_date: "2026-08-29" },
              { series_instance_date: "2026-08-30" },
            ],
            error: null,
          }).then(resolve);
        }
        if (selected === "venue_id") {
          return Promise.resolve({
            data: [{ venue_id: null }],
            error: null,
          }).then(resolve);
        }
        if (selected === "id") {
          return Promise.resolve({ data: [{ id: KEEP_ID }], error: null }).then(
            resolve,
          );
        }
      }
      return Promise.resolve({ data: null, error: null }).then(resolve);
    };
    return builder;
  });

  return {
    client: { from, rpc } as unknown as SupabaseClient,
    writes,
    rpc,
  };
}

async function refresh(client: SupabaseClient) {
  return projectActivity({
    supabase: client,
    source,
    candidateId: "88888888-8888-4888-8888-888888888888",
    observationId: "99999999-9999-4999-8999-999999999999",
    activity,
    confidence,
    locality,
    recordMergeDecision: true,
    now: new Date("2026-08-28T10:00:00.000Z"),
  });
}

describe("linked Activity Graph series refresh", () => {
  beforeEach(() => {
    mocks.pingIndexNow.mockReset().mockResolvedValue(undefined);
    mocks.upsertTranslations.mockReset().mockResolvedValue(undefined);
  });

  it("preserves curated cover and disclosure through a source refresh and occurrence top-up", async () => {
    const db = linkedSeriesClient({ curated: true });
    await refresh(db.client);
    const template = db.writes.find((write) => write.table === "event_series" && !Array.isArray(write.values) && write.values.title);
    expect(template?.values).toMatchObject({
      image_url: "https://cdn.dalat.app/event-materials/activity-graph/yoga/hero.jpg",
      source_metadata: {
        activity_media_provenance: "ai_generated",
        activity_media_alt: expect.stringContaining("AI-generated"),
        activity_media_gallery: [expect.stringContaining("promo.jpg")],
      },
    });
    const occurrences = db.writes.filter((write) => write.table === "events").flatMap((write) => Array.isArray(write.values) ? write.values : [write.values]).filter((row) => row.title);
    expect(occurrences.length).toBeGreaterThan(0);
    for (const row of occurrences) {
      expect(row).toMatchObject({
        image_url: "https://cdn.dalat.app/event-materials/activity-graph/yoga/hero.jpg",
        source_metadata: { activity_media_provenance: "ai_generated", activity_media_alt: expect.stringContaining("AI-generated") },
      });
    }
  });

  it("reconciles drift in place, preserves matching IDs, and resumes last", async () => {
    const db = linkedSeriesClient();
    await expect(refresh(db.client)).resolves.toMatchObject({
      status: "published",
      decision: "update",
      eventSeriesId: SERIES_ID,
    });

    const template = db.writes.find(
      (write) =>
        write.table === "event_series" &&
        !Array.isArray(write.values) &&
        write.values.title,
    );
    expect(template?.values).toMatchObject({
      title: activity.title,
      location_name: activity.locationName,
      address: activity.address,
      price_type: "paid",
      public_access: "confirmed",
      reservation_requirement: "required",
      rrule: "FREQ=WEEKLY;BYDAY=SA",
      starts_at_time: "20:00:00",
      duration_minutes: 90,
      source_platform: "activity-graph",
      status: "paused",
      instances_generated_until: null,
    });
    expect(template?.values).toHaveProperty(
      "source_metadata.activity_observation_id",
    );

    const safetyDraft = db.writes.find(
      (write) =>
        write.table === "events" &&
        !Array.isArray(write.values) &&
        write.values.status === "draft",
    );
    expect(safetyDraft?.filters).toContainEqual({
      method: "in",
      column: "id",
      value: [KEEP_ID, OBSOLETE_ID],
    });

    const matchingRefresh = db.writes.find(
      (write) =>
        write.table === "events" &&
        !Array.isArray(write.values) &&
        write.values.title === activity.title,
    );
    expect(matchingRefresh).toMatchObject({
      values: {
        starts_at: "2026-08-29T13:00:00.000Z",
        ends_at: "2026-08-29T14:30:00.000Z",
        status: "draft",
      },
      filters: [{ method: "eq", column: "id", value: KEEP_ID }],
    });
    expect(
      db.writes.some(
        (write) =>
          write.filters.some(
            (filter) => filter.method === "eq" && filter.value === OBSOLETE_ID,
          ) &&
          !Array.isArray(write.values) &&
          write.values.status === "published",
      ),
    ).toBe(false);

    const inserted = db.writes.find(
      (write) => write.table === "events" && write.method === "upsert",
    );
    expect(inserted?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          series_instance_date: "2026-09-05",
          status: "draft",
          source_locale: "vi",
          title: activity.title,
        }),
      ]),
    );

    expect(db.rpc).toHaveBeenCalledWith(
      "finalize_activity_candidate_publication",
      expect.objectContaining({
        p_occurrence_dates: expect.arrayContaining([
          "2026-08-29",
          "2026-09-05",
        ]),
      }),
    );
    expect(mocks.upsertTranslations).toHaveBeenCalledWith(
      db.client,
      [KEEP_ID],
      activity,
      source.name,
    );
  });

  it("leaves the series paused when missing-date materialization fails", async () => {
    const db = linkedSeriesClient({ failInsert: true });

    await expect(refresh(db.client)).rejects.toThrow(
      "occurrence insert failed",
    );
    expect(
      db.writes.some(
        (write) =>
          write.table === "event_series" &&
          !Array.isArray(write.values) &&
          write.values.status === "active",
      ),
    ).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("does not rewrite a creator-managed series linked as a duplicate", async () => {
    const db = linkedSeriesClient({ sourcePlatform: null });

    await expect(refresh(db.client)).resolves.toMatchObject({
      status: "published",
    });
    const seriesWrites = db.writes.filter(
      (write) => write.table === "event_series",
    );
    expect(seriesWrites).toHaveLength(0);
    expect(db.writes.some((write) => write.table === "events")).toBe(false);
  });
});
