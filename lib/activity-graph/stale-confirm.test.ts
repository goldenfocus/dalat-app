import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FetchedSourceDocument } from "./fetch";

const mocks = vi.hoisted(() => ({ fetchSourceText: vi.fn() }));
vi.mock("./fetch", () => ({
  fetchSourceText: (...args: unknown[]) => mocks.fetchSourceText(...args),
}));

import {
  confirmOrExpireStaleCandidates,
  decideStaleConfirmation,
  httpStatusFromFetchError,
  matchingExtractedActivity,
  sameSourceResource,
  type StaleCandidateSnapshot,
} from "./stale-confirm";
import type { ActivitySource, ExtractedActivity } from "./types";

const CANDIDATE: StaleCandidateSnapshot = {
  id: "candidate-1",
  source_id: "source-1",
  source_uid: "https://maylangthang.com.vn/shows/tq-2609",
  source_url: "https://maylangthang.com.vn/shows/tq-2609",
  activity_kind: "performance",
  status: "published",
  unlist_origin: null,
  stale_after: "2026-09-01T00:00:00.000Z",
  starts_at: "2026-09-26T10:00:00.000Z",
};

const DOCUMENT: FetchedSourceDocument = {
  url: "https://maylangthang.com.vn/shows/tq-2609",
  status: 200,
  contentType: "text/html",
  etag: null,
  lastModified: null,
  text: "<html></html>",
};

function activity(
  overrides: Partial<ExtractedActivity> = {},
): ExtractedActivity {
  return {
    sourceUid: CANDIDATE.source_uid,
    sourceUrl: CANDIDATE.source_url,
    kind: "performance",
    title: "Trung Quân",
    description: null,
    startsAt: "2026-09-26T10:00:00.000Z",
    endsAt: null,
    timezone: "Asia/Ho_Chi_Minh",
    timePrecision: "exact",
    rrule: null,
    startsAtTime: null,
    durationMinutes: null,
    firstOccurrence: null,
    rruleUntil: null,
    locationName: "Mây Lang Thang - Đà Lạt",
    address: "Đà Lạt",
    latitude: null,
    longitude: null,
    organizerName: "Mây Lang Thang",
    organizerUrl: null,
    priceType: "paid",
    ticketTiers: null,
    ticketUrl: CANDIDATE.source_url,
    reservationRequirement: "required",
    publicAccess: "confirmed",
    sourcePublishedAt: null,
    sourceUpdatedAt: null,
    eventStatus: "scheduled",
    evidence: [],
    structuredPayload: {},
    attributes: {},
    ...overrides,
  };
}

describe("sameSourceResource", () => {
  it("treats trailing slashes as the same show page", () => {
    expect(
      sameSourceResource(
        "https://maylangthang.com.vn/shows/tq-2609",
        "https://maylangthang.com.vn/shows/tq-2609/",
      ),
    ).toBe(true);
  });

  it("rejects a live homepage after the show path disappeared", () => {
    expect(
      sameSourceResource(
        "https://maylangthang.com.vn/shows/tq-2609",
        "https://maylangthang.com.vn/",
      ),
    ).toBe(false);
  });
});

describe("httpStatusFromFetchError", () => {
  it("reads the status from fetchSourceText errors", () => {
    expect(
      httpStatusFromFetchError(new Error("Source returned HTTP 404")),
    ).toBe(404);
    expect(httpStatusFromFetchError(new Error("Activity source DNS lookup timed out"))).toBe(
      null,
    );
  });
});

describe("matchingExtractedActivity", () => {
  it("matches by source uid or equivalent show URL", () => {
    const extracted = activity({
      sourceUid: "https://maylangthang.com.vn/shows/tq-2609/",
      sourceUrl: "https://maylangthang.com.vn/shows/tq-2609/",
    });
    expect(matchingExtractedActivity([extracted], CANDIDATE)).toEqual(extracted);
  });
});

describe("decideStaleConfirmation", () => {
  it("re-observes a live scheduled source instead of unlisting for stale_after", () => {
    expect(
      decideStaleConfirmation(CANDIDATE, {
        ok: true,
        document: DOCUMENT,
        activities: [activity()],
      }),
    ).toMatchObject({
      type: "ingest",
      activity: expect.objectContaining({
        sourceUid: CANDIDATE.source_uid,
        eventStatus: "scheduled",
      }),
    });
  });

  it("resets freshness when the show URL is still live but not parseable", () => {
    expect(
      decideStaleConfirmation(CANDIDATE, {
        ok: true,
        document: DOCUMENT,
        activities: [],
      }),
    ).toEqual({ type: "reset_freshness" });
  });

  it("does not resurrect an already-unlisted item from a bare 200", () => {
    expect(
      decideStaleConfirmation(
        { ...CANDIDATE, status: "unlisted", unlist_origin: "system_stale" },
        { ok: true, document: DOCUMENT, activities: [] },
      ),
    ).toEqual({
      type: "skip",
      reason: "unlisted_without_extractable_schedule",
    });
  });

  it("unlists only when the source page is gone", () => {
    expect(
      decideStaleConfirmation(CANDIDATE, {
        ok: false,
        error: new Error("Source returned HTTP 404"),
      }),
    ).toEqual({
      type: "unlist",
      reason: "Automatically unlisted after the source page returned HTTP 404",
    });
  });

  it("unlists a clearly cancelled or postponed source page", () => {
    expect(
      decideStaleConfirmation(CANDIDATE, {
        ok: true,
        document: DOCUMENT,
        activities: [activity({ eventStatus: "cancelled" })],
      }),
    ).toEqual({
      type: "unlist",
      reason: "Official source reports cancelled",
    });
    expect(
      decideStaleConfirmation(CANDIDATE, {
        ok: true,
        document: DOCUMENT,
        activities: [activity({ eventStatus: "postponed" })],
      }),
    ).toEqual({
      type: "unlist",
      reason: "Official source reports postponed",
    });
  });

  it("keeps the listing when the source fetch fails transiently", () => {
    expect(
      decideStaleConfirmation(CANDIDATE, {
        ok: false,
        error: new Error("Activity source DNS lookup timed out"),
      }),
    ).toEqual({ type: "skip", reason: "transient_fetch_error" });
    expect(
      decideStaleConfirmation(CANDIDATE, {
        ok: false,
        error: new Error("Source returned HTTP 503"),
      }),
    ).toEqual({ type: "skip", reason: "transient_fetch_error" });
  });

  it("never overrides an administrator unlist", () => {
    expect(
      decideStaleConfirmation(
        { ...CANDIDATE, status: "unlisted", unlist_origin: "admin" },
        { ok: true, document: DOCUMENT, activities: [activity()] },
      ),
    ).toEqual({ type: "skip", reason: "admin_unlist" });
  });

  it("unlists when the show URL redirected to a different page", () => {
    expect(
      decideStaleConfirmation(CANDIDATE, {
        ok: true,
        document: { ...DOCUMENT, url: "https://maylangthang.com.vn/" },
        activities: [],
      }),
    ).toEqual({
      type: "unlist",
      reason:
        "Automatically unlisted after the source page no longer hosts this activity",
    });
  });
});

const SOURCE: ActivitySource = {
  id: "source-1",
  slug: "may-lang-thang",
  name: "Mây Lang Thang",
  canonical_url: "https://maylangthang.com.vn",
  discovery_url: "https://maylangthang.com.vn/sitemap.xml",
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
  metadata: null,
};

const SCHEDULED_HTML = `
  <script type="application/ld+json">
  {"@type":"Event","name":"Trung Quân","startDate":"2026-09-26T17:00:00+07:00",
   "eventStatus":"https://schema.org/EventScheduled",
   "url":"https://maylangthang.com.vn/shows/tq-2609"}
  </script>`;

function thenableQuery(data: unknown = []) {
  const resolved = { data, error: null };
  const api: Record<string, unknown> = {};
  const next = () => api;
  for (const method of [
    "select",
    "eq",
    "not",
    "lte",
    "in",
    "is",
    "or",
    "order",
    "limit",
    "update",
  ]) {
    api[method] = next;
  }
  api.then = (
    resolve: (value: typeof resolved) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(resolved).then(resolve, reject);
  return api;
}

describe("confirmOrExpireStaleCandidates", () => {
  it("re-ingests a live scheduled page instead of system_stale unlisting", async () => {
    mocks.fetchSourceText.mockReset().mockResolvedValue({
      ...DOCUMENT,
      text: SCHEDULED_HTML,
    });
    const ingestActivity = vi.fn().mockResolvedValue({
      projection: null,
      observationCreated: false,
    });
    const rpc = vi.fn();
    const supabase = {
      rpc,
      from: vi.fn((table: string) => {
        if (table !== "activity_candidates") {
          throw new Error(`Unexpected table: ${table}`);
        }
        return thenableQuery([CANDIDATE]);
      }),
    } as unknown as SupabaseClient;

    await expect(
      confirmOrExpireStaleCandidates(supabase, new Date("2026-09-08T02:00:00.000Z"), {
        sourceId: SOURCE.id,
        sources: [SOURCE],
        ingestActivity,
      }),
    ).resolves.toEqual({
      unlisted: 0,
      confirmed: 1,
      freshnessReset: 0,
      skipped: 0,
      seenSourceUids: [CANDIDATE.source_uid],
    });
    expect(ingestActivity).toHaveBeenCalledTimes(1);
    expect(ingestActivity.mock.calls[0][2]).toMatchObject({
      title: "Trung Quân",
      eventStatus: "scheduled",
      sourceUrl: CANDIDATE.source_url,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("unlists only after a live 404", async () => {
    mocks.fetchSourceText
      .mockReset()
      .mockRejectedValue(new Error("Source returned HTTP 404"));
    const ingestActivity = vi.fn();
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const supabase = {
      rpc,
      from: vi.fn((table: string) => {
        if (table !== "activity_candidates") {
          throw new Error(`Unexpected table: ${table}`);
        }
        return thenableQuery([CANDIDATE]);
      }),
    } as unknown as SupabaseClient;

    await expect(
      confirmOrExpireStaleCandidates(supabase, new Date("2026-09-08T02:00:00.000Z"), {
        sourceId: SOURCE.id,
        sources: [SOURCE],
        ingestActivity,
      }),
    ).resolves.toMatchObject({ unlisted: 1, confirmed: 0, seenSourceUids: [] });
    expect(ingestActivity).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("apply_activity_candidate_system_unlist", {
      p_candidate_ids: [CANDIDATE.id],
      p_unlisted_at: "2026-09-08T02:00:00.000Z",
      p_reason: "Automatically unlisted after the source page returned HTTP 404",
      p_future_events_only: true,
    });
  });

  it("does not unlist when the live fetch fails transiently", async () => {
    mocks.fetchSourceText
      .mockReset()
      .mockRejectedValue(new Error("Source returned HTTP 503"));
    const ingestActivity = vi.fn();
    const rpc = vi.fn();
    const supabase = {
      rpc,
      from: vi.fn(() => thenableQuery([CANDIDATE])),
    } as unknown as SupabaseClient;

    await expect(
      confirmOrExpireStaleCandidates(supabase, new Date("2026-09-08T02:00:00.000Z"), {
        sources: [SOURCE],
        ingestActivity,
      }),
    ).resolves.toMatchObject({
      unlisted: 0,
      skipped: 1,
      seenSourceUids: [],
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(ingestActivity).not.toHaveBeenCalled();
  });

  it("resets freshness when the source URL is still live", async () => {
    mocks.fetchSourceText.mockReset().mockResolvedValue({
      ...DOCUMENT,
      text: "<html><p>Show still listed</p></html>",
    });
    const ingestActivity = vi.fn();
    const updates: Record<string, unknown>[] = [];
    const supabase = {
      rpc: vi.fn(),
      from: vi.fn((table: string) => {
        if (table !== "activity_candidates") {
          throw new Error(`Unexpected table: ${table}`);
        }
        const api = thenableQuery([CANDIDATE]);
        api.update = (patch: Record<string, unknown>) => {
          updates.push(patch);
          return api;
        };
        return api;
      }),
    } as unknown as SupabaseClient;

    await expect(
      confirmOrExpireStaleCandidates(supabase, new Date("2026-09-08T02:00:00.000Z"), {
        sources: [SOURCE],
        ingestActivity,
      }),
    ).resolves.toMatchObject({
      unlisted: 0,
      freshnessReset: 1,
      seenSourceUids: [CANDIDATE.source_uid],
    });
    expect(ingestActivity).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({
      missing_runs: 0,
      last_confirmed_at: "2026-09-08T02:00:00.000Z",
      stale_after: "2026-09-15T02:00:00.000Z",
    });
  });
});
