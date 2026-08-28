import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { ActivitySource } from "./types";

vi.mock("./project", () => ({ projectActivity: vi.fn() }));

import {
  buildSourceHealthPatch,
  calculateSourceProcessingDeadline,
  classifyCandidateSuppression,
  expireStaleCandidates,
  isInventoryReconciliationEligible,
  reconcileMissingCandidates,
  syncActivitySource,
} from "./ingest";

const NOW = new Date("2026-08-28T02:00:00.000Z");

describe("activity source health", () => {
  it("uses the tighter of the 90-second source cap and caller route deadline", () => {
    expect(calculateSourceProcessingDeadline(1_000)).toBe(86_000);
    expect(calculateSourceProcessingDeadline(1_000, 51_000)).toBe(46_000);
  });

  it("records success only when at least one activity was usable and no source-wide failure occurred", () => {
    const result = buildSourceHealthPatch({
      now: NOW,
      crawlIntervalMinutes: 60,
      previousConsecutiveFailures: 3,
      usableActivities: 2,
      sourceWideFailure: false,
      errors: ["one sitemap page could not be parsed"],
      changed: true,
    });

    expect(result.successful).toBe(true);
    expect(result.patch).toMatchObject({
      last_success_at: NOW.toISOString(),
      last_checked_at: NOW.toISOString(),
      last_error_at: NOW.toISOString(),
      consecutive_failures: 0,
      last_changed_at: NOW.toISOString(),
      next_check_at: "2026-08-28T03:00:00.000Z",
    });
  });

  it.each([
    { usableActivities: 0, sourceWideFailure: false },
    { usableActivities: 4, sourceWideFailure: true },
  ])(
    "increments failures without advancing last_success_at for $usableActivities usable activities / sourceWideFailure=$sourceWideFailure",
    (input) => {
      const result = buildSourceHealthPatch({
        now: NOW,
        crawlIntervalMinutes: 240,
        previousConsecutiveFailures: 2,
        ...input,
        errors: ["source run failed"],
        changed: false,
      });

      expect(result.successful).toBe(false);
      expect(result.patch).not.toHaveProperty("last_success_at");
      expect(result.patch).toMatchObject({
        consecutive_failures: 3,
        next_check_at: "2026-08-28T03:00:00.000Z",
      });
    },
  );
});

describe("candidate unlist suppression", () => {
  const base = {
    id: "candidate-1",
    decision: "unlist",
    admin_action_at: null,
    missing_runs: 0,
  };

  it("never automatically republishes an administrator-unlisted candidate", () => {
    expect(
      classifyCandidateSuppression({
        ...base,
        status: "unlisted",
        decision_reason:
          "Unlisted by administrator; automatic republish suppressed",
        unlist_origin: null,
      }),
    ).toEqual({ adminSuppressed: true, systemStale: false });
  });

  it("treats the administrator decision as final even if an earlier system-stale marker remains", () => {
    expect(
      classifyCandidateSuppression({
        ...base,
        status: "unlisted",
        decision_reason:
          "Unlisted by administrator; automatic republish suppressed",
        unlist_origin: "system_stale",
      }),
    ).toEqual({ adminSuppressed: true, systemStale: false });
  });

  it("allows only a system-stale candidate to enter automatic reappearance evaluation", () => {
    expect(
      classifyCandidateSuppression({
        ...base,
        status: "unlisted",
        decision_reason:
          "Automatically unlisted after two complete source runs",
        unlist_origin: "system_stale",
      }),
    ).toEqual({ adminSuppressed: false, systemStale: true });
  });
});

describe("source inventory reconciliation", () => {
  it("requires a complete, usable, error-free inventory", () => {
    expect(
      isInventoryReconciliationEligible({
        inventoryComplete: true,
        usableActivities: 2,
        errors: [],
      }),
    ).toBe(true);
    expect(
      isInventoryReconciliationEligible({
        inventoryComplete: false,
        usableActivities: 2,
        errors: ["Activity source wall-clock budget exhausted"],
      }),
    ).toBe(false);
    expect(
      isInventoryReconciliationEligible({
        inventoryComplete: true,
        usableActivities: 0,
        errors: [],
      }),
    ).toBe(false);
    expect(
      isInventoryReconciliationEligible({
        inventoryComplete: true,
        usableActivities: 2,
        errors: ["one page failed"],
      }),
    ).toBe(false);
  });

  it("deduplicates seen source IDs and returns database reconciliation counters", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { incremented: "2", unlisted: 1 },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    await expect(
      reconcileMissingCandidates(
        supabase,
        "source-1",
        ["activity-a", "activity-a", "activity-b"],
        NOW,
      ),
    ).resolves.toEqual({ incremented: 2, unlisted: 1 });
    expect(rpc).toHaveBeenCalledWith(
      "reconcile_activity_source_disappearances",
      {
        p_source_id: "source-1",
        p_seen_source_uids: ["activity-a", "activity-b"],
        p_seen_at: NOW.toISOString(),
      },
    );
  });

  it("fails the source run when database reconciliation fails", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "database unavailable" },
      }),
    } as unknown as SupabaseClient;

    await expect(
      reconcileMissingCandidates(supabase, "source-1", ["activity-a"], NOW),
    ).rejects.toThrow(
      "Source disappearance reconciliation failed: database unavailable",
    );
  });

  it("expires stale published candidates independently of inventory completeness", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { unlisted: "3" },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    await expect(
      expireStaleCandidates(supabase, "source-1", NOW),
    ).resolves.toEqual({ unlisted: 3 });
    expect(rpc).toHaveBeenCalledWith(
      "expire_stale_activity_source_candidates",
      {
        p_source_id: "source-1",
        p_checked_at: NOW.toISOString(),
      },
    );
  });

  it("runs freshness expiry but not disappearance reconciliation after a source-wide failure", async () => {
    const sourceHealthUpdate = vi.fn();
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { unlisted: 1 }, error: null });
    const supabase = {
      rpc,
      from: vi.fn((table: string) => {
        if (table !== "activity_sources")
          throw new Error(`Unexpected table: ${table}`);
        return {
          update: (patch: Record<string, unknown>) => {
            sourceHealthUpdate(patch);
            return { eq: vi.fn().mockResolvedValue({ error: null }) };
          },
        };
      }),
    } as unknown as SupabaseClient;
    const source = {
      id: "source-1",
      slug: "broken-source",
      name: "Broken source",
      canonical_url: "https://example.com",
      discovery_url: "https://example.com/activities",
      page_path_prefix: "/activities/",
      source_kind: "first_party_venue",
      fetch_mode: "unsupported",
      access_basis: "first_party_page",
      trust_tier: 1,
      policy_status: "approved",
      crawl_interval_minutes: 240,
      max_items_per_run: 25,
      status: "active",
      auto_publish_enabled: true,
      auto_publish_threshold: 95,
      organizer_id: null,
      venue_id: null,
      metadata: null,
      consecutive_failures: 2,
    } as ActivitySource & { consecutive_failures: number };

    const result = await syncActivitySource(supabase, source, NOW);

    expect(result.unlisted).toBe(1);
    expect(result.errors).toContain(
      "Unsupported activity source mode: unsupported",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "expire_stale_activity_source_candidates",
      {
        p_source_id: "source-1",
        p_checked_at: NOW.toISOString(),
      },
    );
    expect(sourceHealthUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        consecutive_failures: 3,
      }),
    );
    expect(sourceHealthUpdate.mock.calls[0][0]).not.toHaveProperty(
      "last_success_at",
    );
  });
});
