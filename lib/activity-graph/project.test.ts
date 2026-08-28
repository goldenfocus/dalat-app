import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { projectActivity } from "./project";
import type {
  ActivitySource,
  ConfidenceResult,
  ExtractedActivity,
  LocalityResult,
} from "./types";

const mocks = vi.hoisted(() => ({
  pingIndexNow: vi.fn(),
  upsertTranslations: vi.fn(),
  rpc: vi.fn(),
  writes: [] as Array<{ table: string; values: Record<string, unknown> }>,
}));

vi.mock("@/lib/seo/indexnow", () => ({ pingIndexNow: mocks.pingIndexNow }));
vi.mock("@/lib/i18n/routing", () => ({ locales: ["en", "vi"] }));
vi.mock("./translations", () => ({
  sourceDescription: () => "Official source summary",
  upsertActivityEventTranslations: mocks.upsertTranslations,
}));

const source: ActivitySource = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "official-source",
  name: "Official Source",
  canonical_url: "https://example.com",
  discovery_url: "https://example.com/sitemap.xml",
  page_path_prefix: "/activities/",
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
  sourceUid: "https://example.com/activities/acoustic",
  sourceUrl: "https://example.com/activities/acoustic",
  kind: "performance",
  title: "Official acoustic night",
  description: "Official source summary",
  startsAt: "2026-09-01T12:30:00.000Z",
  endsAt: "2026-09-01T14:30:00.000Z",
  timezone: "Asia/Ho_Chi_Minh",
  timePrecision: "exact",
  rrule: null,
  startsAtTime: null,
  durationMinutes: 120,
  firstOccurrence: null,
  rruleUntil: null,
  locationName: "Official Venue",
  address: "Đà Lạt",
  latitude: null,
  longitude: null,
  organizerName: "Official Source",
  organizerUrl: "https://example.com",
  priceType: null,
  ticketTiers: null,
  ticketUrl: "https://example.com/activities/acoustic",
  reservationRequirement: "required",
  publicAccess: "confirmed",
  sourcePublishedAt: null,
  sourceUpdatedAt: null,
  eventStatus: "scheduled",
  evidence: [
    {
      fieldPath: "title",
      rawValue: "Official acoustic night",
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

function confidence(
  overrides: Partial<ConfidenceResult> = {},
): ConfidenceResult {
  return {
    score: 100,
    components: {},
    penalties: {},
    hardGateFailures: [],
    ...overrides,
  };
}

function linkedClient(sourcePlatform: string | null = "activity-graph") {
  const from = vi.fn((table: string) => {
    let isWrite = false;
    const builder: Record<string, ReturnType<typeof vi.fn>> & {
      then?: (resolve: (value: unknown) => unknown) => Promise<unknown>;
    } = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.gte = vi.fn(() => builder);
    builder.update = vi.fn((values: Record<string, unknown>) => {
      isWrite = true;
      mocks.writes.push({ table, values });
      return builder;
    });
    builder.upsert = vi.fn((values: Record<string, unknown>) => {
      isWrite = true;
      mocks.writes.push({ table, values });
      return builder;
    });
    builder.maybeSingle = vi.fn(async () => {
      if (table === "activity_canonical_links" && !isWrite) {
        return {
          data: {
            event_id: "22222222-2222-4222-8222-222222222222",
            event_series_id: null,
          },
          error: null,
        };
      }
      if (table === "events" && !isWrite) {
        return {
          data: {
            id: "22222222-2222-4222-8222-222222222222",
            source_platform: sourcePlatform,
            slug: "official-acoustic-night",
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    builder.then = (resolve) =>
      Promise.resolve({ data: null, error: null }).then(resolve);
    return builder;
  });
  return { from, rpc: mocks.rpc } as unknown as SupabaseClient;
}

function corroboratingSeriesClient() {
  const seriesId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const from = vi.fn((table: string) => {
    let selected = "";
    let isWrite = false;
    const builder: Record<string, ReturnType<typeof vi.fn>> & {
      then?: (resolve: (value: unknown) => unknown) => Promise<unknown>;
    } = {};
    builder.select = vi.fn((columns: string) => {
      selected = columns;
      return builder;
    });
    builder.eq = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.insert = vi.fn(() => {
      isWrite = true;
      return builder;
    });
    builder.upsert = vi.fn(() => {
      isWrite = true;
      return builder;
    });
    builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    builder.then = (resolve) => {
      if (
        table === "event_series" &&
        !isWrite &&
        selected.includes("starts_at_time")
      ) {
        return Promise.resolve({
          data: [
            {
              id: seriesId,
              title: "Official acoustic night",
              starts_at_time: "19:30:00",
              rrule: "FREQ=DAILY",
              location_name: "Official Venue",
              address: "Đà Lạt",
              organizer_id: "88888888-8888-4888-8888-888888888888",
              external_chat_url: activity.sourceUrl,
              source_platform: "activity-graph",
            },
          ],
          error: null,
        }).then(resolve);
      }
      return Promise.resolve({ data: null, error: null }).then(resolve);
    };
    return builder;
  });
  return {
    client: { from, rpc: mocks.rpc } as unknown as SupabaseClient,
    seriesId,
  };
}

type RecoveryWrite = {
  table: string;
  method: "update" | "insert" | "upsert";
  values: Record<string, unknown> | Array<Record<string, unknown>>;
  filters: Array<{ column: string; value: unknown }>;
};

function recoveryClient(kind: "event" | "series") {
  const eventId = "55555555-5555-4555-8555-555555555555";
  const seriesId = "66666666-6666-4666-8666-666666666666";
  const occurrenceId = "77777777-7777-4777-8777-777777777777";
  const orphanSeries = {
    id: seriesId,
    slug: "nightly-acoustic",
    title: "Nightly acoustic",
    description: "Official source summary",
    image_url: null,
    location_name: "Official Venue",
    address: "Đà Lạt",
    google_maps_url: null,
    latitude: null,
    longitude: null,
    external_chat_url: "https://example.com/activities/acoustic",
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
    organizer_id: "88888888-8888-4888-8888-888888888888",
    venue_id: null,
    created_by: "99999999-9999-4999-8999-999999999999",
    rrule: "FREQ=DAILY",
    starts_at_time: "19:30:00",
    duration_minutes: 120,
    first_occurrence: "2026-08-28",
    rrule_until: null,
    rrule_count: null,
    status: "paused",
    instances_generated_until: null,
    created_at: "2026-08-28T00:00:00.000Z",
    updated_at: "2026-08-28T00:00:00.000Z",
    source_platform: "activity-graph",
    source_metadata: {},
    activity_kind: "recurring_activity",
    public_access: "confirmed",
    reservation_requirement: "recommended",
    last_checked_at: "2026-08-28T09:00:00.000Z",
    last_confirmed_at: "2026-08-28T09:00:00.000Z",
    source_updated_at: null,
    freshness_score: 100,
  };
  const writes: RecoveryWrite[] = [];
  const duplicateStatusFilters: Array<{ table: string; value: unknown }> = [];
  const from = vi.fn((table: string) => {
    let selected = "";
    let write: RecoveryWrite | null = null;
    const builder: Record<string, ReturnType<typeof vi.fn>> & {
      then?: (resolve: (value: unknown) => unknown) => Promise<unknown>;
    } = {};
    builder.select = vi.fn((columns: string) => {
      selected = columns;
      return builder;
    });
    builder.eq = vi.fn((column: string, value: unknown) => {
      write?.filters.push({ column, value });
      if (column === "status") duplicateStatusFilters.push({ table, value });
      return builder;
    });
    builder.is = vi.fn(() => builder);
    builder.gte = vi.fn(() => builder);
    builder.lte = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.update = vi.fn((values: Record<string, unknown>) => {
      write = { table, method: "update", values, filters: [] };
      writes.push(write);
      return builder;
    });
    builder.insert = vi.fn((values: Record<string, unknown>) => {
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
        return { data: null, error: null };
      }
      if (table === "events" && kind === "event") {
        return {
          data: { id: eventId, slug: "official-acoustic-night" },
          error: null,
        };
      }
      if (table === "event_series" && kind === "series") {
        return { data: orphanSeries, error: null };
      }
      return { data: null, error: null };
    });
    builder.single = vi.fn(async () => {
      if (table === "events" && kind === "event") {
        return {
          data: { id: eventId, slug: "official-acoustic-night" },
          error: null,
        };
      }
      if (table === "event_series" && kind === "series") {
        const values = !Array.isArray(write?.values) ? write?.values : {};
        return { data: { ...orphanSeries, ...values }, error: null };
      }
      return { data: null, error: null };
    });
    builder.then = (resolve) => {
      if (
        !write &&
        table === "events" &&
        selected.includes("title,starts_at")
      ) {
        return Promise.resolve({ data: [], error: null }).then(resolve);
      }
      if (
        !write &&
        table === "event_series" &&
        selected.includes("title,starts_at_time")
      ) {
        return Promise.resolve({ data: [], error: null }).then(resolve);
      }
      if (!write && table === "events" && selected === "series_instance_date") {
        return Promise.resolve({ data: [], error: null }).then(resolve);
      }
      if (!write && table === "events" && selected === "venue_id") {
        return Promise.resolve({ data: [], error: null }).then(resolve);
      }
      if (!write && table === "events" && selected === "id") {
        return Promise.resolve({
          data: [{ id: occurrenceId }],
          error: null,
        }).then(resolve);
      }
      return Promise.resolve({ data: null, error: null }).then(resolve);
    };
    return builder;
  });
  return {
    client: { from, rpc: mocks.rpc } as unknown as SupabaseClient,
    writes,
    duplicateStatusFilters,
    eventId,
    seriesId,
  };
}

describe("linked Activity Graph safety gates", () => {
  beforeEach(() => {
    mocks.writes.length = 0;
    mocks.pingIndexNow.mockReset().mockResolvedValue(undefined);
    mocks.upsertTranslations.mockReset().mockResolvedValue(undefined);
    mocks.rpc.mockReset().mockImplementation(async (name: string) => ({
      data:
        name === "finalize_activity_candidate_publication"
          ? { published: true }
          : {},
      error: null,
    }));
  });

  it("unlists a linked event instead of refreshing it when a hard gate fails", async () => {
    const result = await projectActivity({
      supabase: linkedClient(),
      source,
      candidateId: "33333333-3333-4333-8333-333333333333",
      observationId: "44444444-4444-4444-8444-444444444444",
      activity: { ...activity, publicAccess: "unknown" },
      confidence: confidence({
        score: 95,
        hardGateFailures: ["public_access_unconfirmed"],
      }),
      locality,
      recordMergeDecision: true,
      now: new Date("2026-08-28T02:00:00.000Z"),
    });

    expect(result).toMatchObject({ status: "withheld", decision: "withhold" });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "suppress_activity_candidate_projection",
      {
        p_candidate_id: "33333333-3333-4333-8333-333333333333",
        p_hidden_at: "2026-08-28T02:00:00.000Z",
        p_event_status: "draft",
      },
    );
    expect(
      mocks.writes.some(
        ({ table, values }) =>
          table === "events" && Object.hasOwn(values, "title"),
      ),
    ).toBe(false);
  });

  it("unlists a linked event when refreshed confidence falls below its source threshold", async () => {
    const result = await projectActivity({
      supabase: linkedClient(),
      source,
      candidateId: "33333333-3333-4333-8333-333333333333",
      observationId: "44444444-4444-4444-8444-444444444444",
      activity,
      confidence: confidence({ score: 94 }),
      locality,
      recordMergeDecision: true,
      now: new Date("2026-08-28T02:00:00.000Z"),
    });

    expect(result).toMatchObject({ status: "withheld", decision: "withhold" });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "suppress_activity_candidate_projection",
      expect.objectContaining({ p_event_status: "draft" }),
    );
  });

  it("keeps a past linked occurrence as an archive when every other gate passes", async () => {
    const result = await projectActivity({
      supabase: linkedClient(),
      source,
      candidateId: "33333333-3333-4333-8333-333333333333",
      observationId: "44444444-4444-4444-8444-444444444444",
      activity: { ...activity, startsAt: "2026-08-27T12:30:00.000Z" },
      confidence: confidence({ hardGateFailures: ["past_occurrence"] }),
      locality,
      recordMergeDecision: true,
      now: new Date("2026-08-28T02:00:00.000Z"),
    });

    expect(result).toMatchObject({ status: "published", decision: "update" });
    expect(
      mocks.writes.some(
        ({ table, values }) => table === "events" && values.status === "draft",
      ),
    ).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "suppress_activity_candidate_projection",
      expect.anything(),
    );
    const eventRefresh = mocks.writes.find(
      ({ table, values }) =>
        table === "events" && Object.hasOwn(values, "source_metadata"),
    );
    expect(eventRefresh?.values).toHaveProperty(
      "source_metadata.activity_observation_id",
      "44444444-4444-4444-8444-444444444444",
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "finalize_activity_candidate_publication",
      expect.objectContaining({ p_published_new: false }),
    );
  });

  it("projects official source media without an event approval step", async () => {
    const officialImage = "https://example.com/images/acoustic-poster.webp";
    await projectActivity({
      supabase: linkedClient(),
      source: {
        ...source,
        metadata: {
          media_policy: "official_source_embed",
          media_reuse_allowed: true,
          attribution_text: "Official Source",
        },
      },
      candidateId: "33333333-3333-4333-8333-333333333333",
      observationId: "44444444-4444-4444-8444-444444444444",
      activity: {
        ...activity,
        mediaCandidates: [
          {
            url: officialImage,
            role: "primary",
            sourceUrl: activity.sourceUrl,
            locator: "jsonld:Event.image",
          },
        ],
      },
      confidence: confidence(),
      locality,
      recordMergeDecision: true,
      now: new Date("2026-08-28T02:00:00.000Z"),
    });

    const eventRefresh = mocks.writes.find(
      ({ table, values }) =>
        table === "events" && Object.hasOwn(values, "source_metadata"),
    );
    expect(eventRefresh?.values).toMatchObject({
      image_url: officialImage,
      source_metadata: {
        activity_media_url: officialImage,
        activity_media_attribution: "Official Source",
        media_reuse_allowed: true,
      },
    });
  });

  it("does not rewrite a creator-managed event linked as a duplicate", async () => {
    const result = await projectActivity({
      supabase: linkedClient(null),
      source,
      candidateId: "33333333-3333-4333-8333-333333333333",
      observationId: "44444444-4444-4444-8444-444444444444",
      activity,
      confidence: confidence(),
      locality,
      recordMergeDecision: true,
      now: new Date("2026-08-28T02:00:00.000Z"),
    });

    expect(result).toMatchObject({ status: "published", decision: "update" });
    expect(mocks.writes.some(({ table }) => table === "events")).toBe(false);
    expect(mocks.upsertTranslations).not.toHaveBeenCalled();
    expect(mocks.pingIndexNow).not.toHaveBeenCalled();
  });

  it("does not republish obsolete drafts when corroborating an active series", async () => {
    const db = corroboratingSeriesClient();
    const recurring: ExtractedActivity = {
      ...activity,
      kind: "recurring_activity",
      startsAt: null,
      endsAt: null,
      timePrecision: "recurring",
      rrule: "FREQ=DAILY",
      startsAtTime: "19:30:00",
      durationMinutes: 120,
      firstOccurrence: "2026-08-28",
    };

    const result = await projectActivity({
      supabase: db.client,
      source: {
        ...source,
        organizer_id: "88888888-8888-4888-8888-888888888888",
      },
      candidateId: "33333333-3333-4333-8333-333333333333",
      observationId: "44444444-4444-4444-8444-444444444444",
      activity: recurring,
      confidence: confidence(),
      locality,
      recordMergeDecision: true,
      now: new Date("2026-08-28T02:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "published",
      decision: "merge",
      eventSeriesId: db.seriesId,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "finalize_activity_candidate_publication",
      expect.objectContaining({ p_occurrence_dates: [] }),
    );
  });
});

describe("Activity Graph projection crash recovery", () => {
  beforeEach(() => {
    vi.stubEnv("IMPORT_CREATED_BY", "99999999-9999-4999-8999-999999999999");
    mocks.pingIndexNow.mockReset().mockResolvedValue(undefined);
    mocks.upsertTranslations.mockReset().mockResolvedValue(undefined);
    mocks.rpc.mockReset().mockResolvedValue({
      data: { published: true },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("recovers its candidate-owned event draft before generic dedupe", async () => {
    const db = recoveryClient("event");
    const result = await projectActivity({
      supabase: db.client,
      source: {
        ...source,
        organizer_id: "88888888-8888-4888-8888-888888888888",
      },
      candidateId: "33333333-3333-4333-8333-333333333333",
      observationId: "44444444-4444-4444-8444-444444444444",
      activity,
      confidence: confidence(),
      locality,
      recordMergeDecision: true,
      now: new Date("2026-08-28T02:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "published",
      decision: "publish",
      eventId: db.eventId,
    });
    expect(db.duplicateStatusFilters).toContainEqual({
      table: "events",
      value: "published",
    });
    expect(db.writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "events",
          method: "update",
          values: expect.objectContaining({
            status: "draft",
            image_url:
              "https://dalat.app/activity-art/events/official-acoustic-night.png",
          }),
        }),
        expect.objectContaining({
          table: "activity_canonical_links",
          method: "upsert",
        }),
      ]),
    );
    expect(mocks.upsertTranslations).toHaveBeenCalledWith(
      db.client,
      [db.eventId],
      activity,
      source.name,
    );
  });

  it("recovers its candidate-owned paused series and materializes drafts", async () => {
    const db = recoveryClient("series");
    const recurring: ExtractedActivity = {
      ...activity,
      kind: "recurring_activity",
      startsAt: null,
      endsAt: null,
      timePrecision: "recurring",
      rrule: "FREQ=DAILY",
      startsAtTime: "19:30:00",
      durationMinutes: 120,
      firstOccurrence: "2026-08-28",
    };
    const result = await projectActivity({
      supabase: db.client,
      source: {
        ...source,
        organizer_id: "88888888-8888-4888-8888-888888888888",
      },
      candidateId: "33333333-3333-4333-8333-333333333333",
      observationId: "44444444-4444-4444-8444-444444444444",
      activity: recurring,
      confidence: confidence(),
      locality,
      recordMergeDecision: true,
      now: new Date("2026-08-28T10:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "published",
      decision: "publish",
      eventSeriesId: db.seriesId,
    });
    expect(db.duplicateStatusFilters).toContainEqual({
      table: "event_series",
      value: "active",
    });
    const occurrenceUpsert = db.writes.find(
      (write) => write.table === "events" && write.method === "upsert",
    );
    expect(occurrenceUpsert?.values).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "draft" })]),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "finalize_activity_candidate_publication",
      expect.objectContaining({
        p_occurrence_dates: expect.arrayContaining(["2026-08-28"]),
      }),
    );
  });
});
