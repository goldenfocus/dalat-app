import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSourceText, type FetchedSourceDocument } from "./fetch";
import {
  extractDuoiTanAcoustic,
  extractSchemaOrgEvents,
  parseSitemap,
} from "./parsers";
import { projectActivity, type ProjectionResult } from "./project";
import {
  evaluateDalatLocality,
  freshnessScore,
  scoreActivity,
} from "./scoring";
import {
  ACTIVITY_GRAPH_VERSION,
  type ActivitySource,
  type ExtractedActivity,
} from "./types";

export interface SourceSyncResult {
  source: string;
  pagesSeen: number;
  activitiesSeen: number;
  observationsCreated: number;
  published: number;
  updated: number;
  merged: number;
  unlisted: number;
  withheld: number;
  rejected: number;
  errors: string[];
  decisions: Array<{
    sourceUid: string;
    title: string;
    decision: ProjectionResult["decision"];
    reason: string;
  }>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeIso(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function nextCheck(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

const SYSTEM_STALE_ORIGIN = "system_stale";
const ADMIN_UNLIST_REASON =
  "Unlisted by administrator; automatic republish suppressed";
// Mây's current 15-page inventory takes roughly 31 seconds in a live dry parse,
// so the source cap must leave room for a complete real crawl. The caller may
// also provide the cron's earlier absolute deadline; the tighter limit wins.
const SOURCE_RUN_BUDGET_MS = 90_000;
const SOURCE_FINALIZATION_RESERVE_MS = 5_000;
const MINIMUM_FETCH_BUDGET_MS = 500;
const MAX_FETCH_ATTEMPTS = 4;

export function calculateSourceProcessingDeadline(
  startedAtMs: number,
  routeDeadlineMs?: number,
): number {
  const sourceDeadlineMs = startedAtMs + SOURCE_RUN_BUDGET_MS;
  const hardDeadlineMs = Math.min(
    sourceDeadlineMs,
    routeDeadlineMs ?? sourceDeadlineMs,
  );
  return hardDeadlineMs - SOURCE_FINALIZATION_RESERVE_MS;
}

function fetchBudget(deadlineMs: number): { timeoutMs: number } {
  const remainingMs = deadlineMs - Date.now();
  if (remainingMs < MINIMUM_FETCH_BUDGET_MS) {
    throw new Error("Activity source wall-clock budget exhausted");
  }
  // fetchSourceText can follow three redirects and gives each attempt its own
  // timeout. Divide the remaining wall-clock allowance across all four
  // possible attempts so one redirect chain cannot consume the whole cron.
  return {
    timeoutMs: Math.max(
      1,
      Math.min(15_000, Math.floor(remainingMs / MAX_FETCH_ATTEMPTS)),
    ),
  };
}

interface PreviousCandidateState {
  id: string;
  status: string;
  decision: string;
  decision_reason: string;
  unlist_origin: "admin" | "system_stale" | null;
  admin_action_at: string | null;
  missing_runs: number;
}

export function classifyCandidateSuppression(
  previous: PreviousCandidateState | null,
): { adminSuppressed: boolean; systemStale: boolean } {
  if (!previous) return { adminSuppressed: false, systemStale: false };
  const explicitlyAdminUnlisted =
    previous.status === "unlisted" &&
    (previous.unlist_origin === "admin" ||
      previous.decision_reason === ADMIN_UNLIST_REASON);
  const systemStale =
    previous.unlist_origin === SYSTEM_STALE_ORIGIN && !explicitlyAdminUnlisted;
  return {
    adminSuppressed: previous.status === "unlisted" && !systemStale,
    systemStale,
  };
}

interface SourceHealthInput {
  now: Date;
  crawlIntervalMinutes: number;
  previousConsecutiveFailures: number;
  usableActivities: number;
  sourceWideFailure: boolean;
  errors: string[];
  changed: boolean;
}

export function buildSourceHealthPatch(input: SourceHealthInput): {
  successful: boolean;
  patch: Record<string, unknown>;
} {
  const nowIso = input.now.toISOString();
  const successful = !input.sourceWideFailure && input.usableActivities > 0;
  const patch: Record<string, unknown> = {
    last_checked_at: nowIso,
    last_error_at: input.errors.length > 0 ? nowIso : null,
    error_detail:
      input.errors.length > 0
        ? input.errors.slice(0, 10).join("\n").slice(0, 2000)
        : null,
    consecutive_failures: successful
      ? 0
      : Math.max(0, input.previousConsecutiveFailures) + 1,
    next_check_at: nextCheck(
      input.now,
      successful
        ? input.crawlIntervalMinutes
        : Math.min(input.crawlIntervalMinutes, 60),
    ),
  };
  if (successful) patch.last_success_at = nowIso;
  if (input.changed) patch.last_changed_at = nowIso;
  return { successful, patch };
}

function candidatePayload(
  activity: ExtractedActivity,
): Record<string, unknown> {
  return {
    source_uid: activity.sourceUid,
    source_url: activity.sourceUrl,
    activity_kind: activity.kind,
    title: activity.title,
    description: activity.description,
    starts_at: activity.startsAt,
    ends_at: activity.endsAt,
    timezone: activity.timezone,
    time_precision: activity.timePrecision,
    rrule: activity.rrule,
    starts_at_time: activity.startsAtTime,
    duration_minutes: activity.durationMinutes,
    first_occurrence: activity.firstOccurrence,
    rrule_until: activity.rruleUntil,
    location_name: activity.locationName,
    address: activity.address,
    latitude: activity.latitude,
    longitude: activity.longitude,
    organizer_name: activity.organizerName,
    organizer_url: activity.organizerUrl,
    price_type: activity.priceType,
    ticket_tiers: activity.ticketTiers,
    ticket_url: activity.ticketUrl,
    reservation_requirement: activity.reservationRequirement,
    public_access: activity.publicAccess,
    source_published_at: activity.sourcePublishedAt,
    source_updated_at: activity.sourceUpdatedAt,
    event_status: activity.eventStatus,
    attributes: activity.attributes,
  };
}

async function persistObservation(
  supabase: SupabaseClient,
  source: ActivitySource,
  activity: ExtractedActivity,
  document: FetchedSourceDocument,
  now: Date,
): Promise<{ id: string; created: boolean }> {
  const structuredPayload = {
    source: { url: activity.sourceUrl, fetched_url: document.url },
    activity: activity.structuredPayload,
  };
  const contentHash = sha256(JSON.stringify(structuredPayload));
  const { data: existing, error: existingError } = await supabase
    .from("activity_observations")
    .select("id")
    .eq("source_id", source.id)
    .eq("source_uid", activity.sourceUid)
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (existingError)
    throw new Error(`Observation lookup failed: ${existingError.message}`);
  if (existing?.id) return { id: existing.id, created: false };

  const { data, error } = await supabase
    .from("activity_observations")
    .insert({
      source_id: source.id,
      source_uid: activity.sourceUid,
      source_url: activity.sourceUrl,
      content_hash: contentHash,
      fetched_at: now.toISOString(),
      source_published_at: safeIso(activity.sourcePublishedAt),
      source_updated_at: safeIso(activity.sourceUpdatedAt),
      http_status: document.status,
      content_type: document.contentType,
      etag: document.etag,
      last_modified: document.lastModified,
      extraction_method: source.fetch_mode,
      extractor_version: ACTIVITY_GRAPH_VERSION,
      schema_version: 1,
      structured_payload: structuredPayload,
      extraction_status: "parsed",
    })
    .select("id")
    .single();
  if (error || !data?.id)
    throw new Error(
      `Observation insert failed: ${error?.message ?? "no row returned"}`,
    );
  return { id: data.id, created: true };
}

async function persistParseFailure(
  supabase: SupabaseClient,
  source: ActivitySource,
  document: FetchedSourceDocument,
  reason: string,
  now: Date,
): Promise<void> {
  const contentHash = sha256(document.text);
  const { error } = await supabase.from("activity_observations").upsert(
    {
      source_id: source.id,
      source_uid: document.url,
      source_url: document.url,
      content_hash: contentHash,
      fetched_at: now.toISOString(),
      http_status: document.status,
      content_type: document.contentType,
      etag: document.etag,
      last_modified: document.lastModified,
      extraction_method: source.fetch_mode,
      extractor_version: ACTIVITY_GRAPH_VERSION,
      schema_version: 1,
      structured_payload: null,
      extraction_status: "failed",
      validation_errors: [reason],
      error_detail: reason,
    },
    { onConflict: "source_id,source_uid,content_hash", ignoreDuplicates: true },
  );
  if (error)
    throw new Error(`Parse-failure observation failed: ${error.message}`);
}

async function persistCandidate(
  supabase: SupabaseClient,
  source: ActivitySource,
  activity: ExtractedActivity,
  observationId: string,
  now: Date,
): Promise<{
  id: string;
  suppressed: boolean;
  systemStale: boolean;
  confidence: ReturnType<typeof scoreActivity>;
  locality: ReturnType<typeof evaluateDalatLocality>;
}> {
  const locality = evaluateDalatLocality(activity);
  const confidence = scoreActivity(activity, source, locality, now);
  const { data: previous, error: previousError } = await supabase
    .from("activity_candidates")
    .select(
      "id,status,decision,decision_reason,unlist_origin,admin_action_at,missing_runs",
    )
    .eq("source_id", source.id)
    .eq("source_uid", activity.sourceUid)
    .maybeSingle();
  if (previousError)
    throw new Error(`Candidate lookup failed: ${previousError.message}`);
  const previousState = (previous ?? null) as PreviousCandidateState | null;
  const { adminSuppressed, systemStale } =
    classifyCandidateSuppression(previousState);
  const staleDays = activity.kind === "recurring_activity" ? 14 : 7;
  const row: Record<string, unknown> = {
    source_id: source.id,
    latest_observation_id: observationId,
    source_uid: activity.sourceUid,
    source_url: activity.sourceUrl,
    activity_kind: activity.kind,
    title: activity.title,
    description: activity.description,
    starts_at: activity.startsAt,
    ends_at: activity.endsAt,
    timezone: activity.timezone,
    time_precision: activity.timePrecision,
    rrule: activity.rrule,
    starts_at_time: activity.startsAtTime,
    duration_minutes: activity.durationMinutes,
    first_occurrence: activity.firstOccurrence,
    rrule_until: activity.rruleUntil,
    location_name: activity.locationName,
    address: activity.address,
    latitude: activity.latitude,
    longitude: activity.longitude,
    organizer_name: activity.organizerName,
    organizer_url: activity.organizerUrl,
    price_type: activity.priceType,
    ticket_tiers: activity.ticketTiers,
    ticket_url: activity.ticketUrl,
    reservation_requirement: activity.reservationRequirement,
    public_access: activity.publicAccess,
    normalized_payload: candidatePayload(activity),
    confidence_score: confidence.score,
    confidence_components: {
      ...confidence.components,
      penalties: confidence.penalties,
      hard_gate_failures: confidence.hardGateFailures,
      locality,
    },
    freshness_score: freshnessScore(
      now,
      activity.kind === "recurring_activity" ? 7 : 14,
      1,
      now,
    ),
    locality_status: locality.status,
    duplicate_status: previous ? undefined : "unchecked",
    decision: adminSuppressed || systemStale ? "unlist" : "withhold",
    decision_reason:
      adminSuppressed || systemStale
        ? previousState?.decision_reason || ADMIN_UNLIST_REASON
        : "Awaiting deterministic publication evaluation",
    status: adminSuppressed || systemStale ? "unlisted" : "discovered",
    last_seen_at: now.toISOString(),
    missing_runs: 0,
    unlist_origin: adminSuppressed
      ? (previousState?.unlist_origin ?? null)
      : systemStale
        ? SYSTEM_STALE_ORIGIN
        : null,
    last_checked_at: now.toISOString(),
    last_confirmed_at:
      confidence.hardGateFailures.length === 0 ? now.toISOString() : null,
    source_updated_at: safeIso(activity.sourceUpdatedAt),
    next_check_at: nextCheck(now, source.crawl_interval_minutes),
    stale_after: new Date(now.getTime() + staleDays * 86_400_000).toISOString(),
  };
  // Avoid writing `undefined` through PostgREST; an existing duplicate state
  // remains until the projector computes the new decision.
  if (row.duplicate_status === undefined) delete row.duplicate_status;

  if (previousState) {
    // Observation refreshes must never overwrite an administrator who unlists
    // between the suppression read above and this write. Decision state is
    // advanced only by a conditional projector update or the transactional
    // publication finalizer.
    for (const field of [
      "decision",
      "decision_reason",
      "status",
      "unlist_origin",
      "freshness_score",
      "last_confirmed_at",
    ]) {
      delete row[field];
    }
  }

  const query = previousState
    ? supabase
        .from("activity_candidates")
        .update(row)
        .eq("id", previousState.id)
    : supabase.from("activity_candidates").insert(row);
  const { data, error } = await query.select("id").single();
  if (error || !data?.id) {
    throw new Error(
      `Candidate persistence failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return {
    id: data.id,
    suppressed: adminSuppressed,
    systemStale,
    confidence,
    locality,
  };
}

async function persistEvidence(
  supabase: SupabaseClient,
  candidateId: string,
  observationId: string,
  activity: ExtractedActivity,
  now: Date,
): Promise<void> {
  if (activity.evidence.length === 0) return;
  const rows = activity.evidence.map((row) => ({
    candidate_id: candidateId,
    observation_id: observationId,
    field_path: row.fieldPath,
    raw_value: row.rawValue ?? null,
    normalized_value: row.normalizedValue ?? null,
    evidence_text: row.evidenceText?.slice(0, 500) ?? null,
    evidence_locator: row.locator,
    evidence_hash: sha256(
      `${row.locator}\n${JSON.stringify(row.rawValue ?? null)}`,
    ),
    is_explicit: row.explicit ?? true,
    confidence: row.confidence,
    observed_at: now.toISOString(),
  }));
  const { error } = await supabase.from("activity_evidence").upsert(rows, {
    onConflict: "candidate_id,observation_id,field_path",
  });
  if (error) throw new Error(`Evidence upsert failed: ${error.message}`);
}

function systemStaleReappearanceFailure(
  source: ActivitySource,
  confidence: ReturnType<typeof scoreActivity>,
): string | null {
  if (confidence.hardGateFailures.length > 0) {
    return `System-stale item reappeared but failed safety gates: ${confidence.hardGateFailures.join(", ")}`;
  }
  if (confidence.score < source.auto_publish_threshold) {
    return `System-stale item reappeared at confidence ${confidence.score}, below source threshold ${source.auto_publish_threshold}`;
  }
  return null;
}

async function keepSystemStaleCandidateUnlisted(
  supabase: SupabaseClient,
  candidateId: string,
  reason: string,
  now: Date,
): Promise<ProjectionResult> {
  const { error } = await supabase
    .from("activity_candidates")
    .update({
      status: "unlisted",
      decision: "unlist",
      decision_reason: reason,
      unlist_origin: SYSTEM_STALE_ORIGIN,
      missing_runs: 0,
      freshness_score: 0,
      last_seen_at: now.toISOString(),
      last_checked_at: now.toISOString(),
    })
    .eq("id", candidateId)
    .eq("unlist_origin", SYSTEM_STALE_ORIGIN);
  if (error)
    throw new Error(`System-stale candidate update failed: ${error.message}`);
  return {
    status: "withheld",
    decision: "withhold",
    reason,
    duplicateMatches: [],
    publishedNew: false,
  };
}

export async function ingestVerifiedActivity(
  supabase: SupabaseClient,
  source: ActivitySource,
  activity: ExtractedActivity,
  document: FetchedSourceDocument,
  now: Date,
): Promise<{
  projection: ProjectionResult | null;
  observationCreated: boolean;
}> {
  const observation = await persistObservation(
    supabase,
    source,
    activity,
    document,
    now,
  );
  const candidate = await persistCandidate(
    supabase,
    source,
    activity,
    observation.id,
    now,
  );
  await persistEvidence(supabase, candidate.id, observation.id, activity, now);
  if (candidate.suppressed)
    return { projection: null, observationCreated: observation.created };
  if (candidate.systemStale) {
    const failure = systemStaleReappearanceFailure(
      source,
      candidate.confidence,
    );
    if (failure) {
      const projection = await keepSystemStaleCandidateUnlisted(
        supabase,
        candidate.id,
        failure,
        now,
      );
      return { projection, observationCreated: observation.created };
    }
  }
  const projection = await projectActivity({
    supabase,
    source,
    candidateId: candidate.id,
    observationId: observation.id,
    activity,
    confidence: candidate.confidence,
    locality: candidate.locality,
    recordMergeDecision: observation.created,
    now,
  });
  if (candidate.systemStale) {
    if (projection.status !== "published") {
      await keepSystemStaleCandidateUnlisted(
        supabase,
        candidate.id,
        `System-stale item reappearance remains withheld: ${projection.reason}`,
        now,
      );
    }
  }
  return { projection, observationCreated: observation.created };
}

export async function reconcileMissingCandidates(
  supabase: SupabaseClient,
  sourceId: string,
  seenSourceUids: Iterable<string>,
  now: Date,
): Promise<{ incremented: number; unlisted: number }> {
  const { data, error } = await supabase.rpc(
    "reconcile_activity_source_disappearances",
    {
      p_source_id: sourceId,
      p_seen_source_uids: [...new Set(seenSourceUids)],
      p_seen_at: now.toISOString(),
    },
  );
  if (error) {
    throw new Error(
      `Source disappearance reconciliation failed: ${error.message}`,
    );
  }
  const result =
    data && typeof data === "object"
      ? (data as { incremented?: unknown; unlisted?: unknown })
      : {};
  return {
    incremented: Number(result.incremented) || 0,
    unlisted: Number(result.unlisted) || 0,
  };
}

export async function expireStaleCandidates(
  supabase: SupabaseClient,
  sourceId: string,
  now: Date,
): Promise<{ unlisted: number }> {
  const { data, error } = await supabase.rpc(
    "expire_stale_activity_source_candidates",
    {
      p_source_id: sourceId,
      p_checked_at: now.toISOString(),
    },
  );
  if (error) {
    throw new Error(`Source freshness expiration failed: ${error.message}`);
  }
  const result =
    data && typeof data === "object" ? (data as { unlisted?: unknown }) : {};
  return { unlisted: Number(result.unlisted) || 0 };
}

export function isInventoryReconciliationEligible(input: {
  inventoryComplete: boolean;
  usableActivities: number;
  errors: string[];
}): boolean {
  return (
    input.inventoryComplete &&
    input.usableActivities > 0 &&
    input.errors.length === 0
  );
}

function emptyResult(source: string): SourceSyncResult {
  return {
    source,
    pagesSeen: 0,
    activitiesSeen: 0,
    observationsCreated: 0,
    published: 0,
    updated: 0,
    merged: 0,
    unlisted: 0,
    withheld: 0,
    rejected: 0,
    errors: [],
    decisions: [],
  };
}

function countProjection(
  result: SourceSyncResult,
  projection: ProjectionResult | null,
): void {
  if (!projection) return;
  if (projection.decision === "publish") result.published++;
  else if (projection.decision === "update") result.updated++;
  else if (projection.decision === "merge") result.merged++;
  else if (projection.decision === "withhold") result.withheld++;
  else result.rejected++;
}

export async function syncActivitySource(
  supabase: SupabaseClient,
  source: ActivitySource,
  now: Date = new Date(),
  options: { routeDeadlineMs?: number } = {},
): Promise<SourceSyncResult> {
  const result = emptyResult(source.slug);
  const deadlineMs = calculateSourceProcessingDeadline(
    Date.now(),
    options.routeDeadlineMs,
  );
  const seenSourceUids = new Set<string>();
  let changed = false;
  let inventoryComplete = false;
  let sourceWideFailure = false;
  let usableActivities = 0;
  try {
    const documents: Array<{
      document: FetchedSourceDocument;
      activities: ExtractedActivity[];
    }> = [];
    if (source.fetch_mode === "json_ld_sitemap") {
      if (!source.discovery_url)
        throw new Error("JSON-LD sitemap source has no discovery URL");
      const sitemap = await fetchSourceText(
        source,
        source.discovery_url,
        fetchBudget(deadlineMs),
      );
      const discoveredItems = parseSitemap(
        sitemap.text,
        source.canonical_url,
        source.page_path_prefix,
        source.max_items_per_run + 1,
      );
      if (discoveredItems.length === 0) {
        throw new Error("Sitemap contained no permitted activity URLs");
      }
      inventoryComplete = discoveredItems.length <= source.max_items_per_run;
      const items = discoveredItems.slice(0, source.max_items_per_run);
      if (!inventoryComplete) {
        result.errors.push(
          `Sitemap inventory exceeds max_items_per_run=${source.max_items_per_run}; disappearance reconciliation skipped`,
        );
      }
      for (const item of items) {
        if (deadlineMs - Date.now() < MINIMUM_FETCH_BUDGET_MS) {
          inventoryComplete = false;
          result.errors.push(
            "Activity source wall-clock budget exhausted before all sitemap pages were processed",
          );
          break;
        }
        try {
          const document = await fetchSourceText(
            source,
            item.url,
            fetchBudget(deadlineMs),
          );
          const activities = extractSchemaOrgEvents(
            document.text,
            document.url,
            item.lastModified,
          );
          result.pagesSeen++;
          if (activities.length === 0) {
            inventoryComplete = false;
            await persistParseFailure(
              supabase,
              source,
              document,
              "No schema.org Event found",
              now,
            );
            result.errors.push(`${item.url}: no schema.org Event found`);
          } else {
            documents.push({ document, activities });
          }
        } catch (error) {
          inventoryComplete = false;
          result.errors.push(
            `${item.url}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } else if (source.fetch_mode === "verified_recurring_page") {
      if (!source.discovery_url)
        throw new Error("Recurring-page source has no discovery URL");
      const document = await fetchSourceText(
        source,
        source.discovery_url,
        fetchBudget(deadlineMs),
      );
      result.pagesSeen++;
      const activities =
        source.slug === "duoi-tan-anh-dao"
          ? extractDuoiTanAcoustic(document.text, document.url, now)
          : [];
      if (activities.length === 0) {
        await persistParseFailure(
          supabase,
          source,
          document,
          "Verified recurring evidence no longer matches",
          now,
        );
        throw new Error("Verified recurring evidence no longer matches");
      }
      documents.push({ document, activities });
      inventoryComplete = true;
    } else {
      throw new Error(`Unsupported activity source mode: ${source.fetch_mode}`);
    }

    processing: for (const { document, activities } of documents) {
      for (const activity of activities) {
        if (Date.now() >= deadlineMs) {
          inventoryComplete = false;
          result.errors.push(
            "Activity source wall-clock budget exhausted before all parsed activities were persisted",
          );
          break processing;
        }
        result.activitiesSeen++;
        try {
          const processed = await ingestVerifiedActivity(
            supabase,
            source,
            activity,
            document,
            now,
          );
          usableActivities++;
          seenSourceUids.add(activity.sourceUid);
          if (processed.observationCreated) {
            result.observationsCreated++;
            changed = true;
          }
          countProjection(result, processed.projection);
          if (processed.projection) {
            result.decisions.push({
              sourceUid: activity.sourceUid,
              title: activity.title,
              decision: processed.projection.decision,
              reason: processed.projection.reason,
            });
          }
        } catch (error) {
          inventoryComplete = false;
          result.errors.push(
            `${activity.sourceUid}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    if (usableActivities === 0) {
      throw new Error("Source run produced no usable parsed activities");
    }
    if (
      isInventoryReconciliationEligible({
        inventoryComplete,
        usableActivities,
        errors: result.errors,
      })
    ) {
      const reconciliation = await reconcileMissingCandidates(
        supabase,
        source.id,
        seenSourceUids,
        now,
      );
      result.unlisted += reconciliation.unlisted;
      if (reconciliation.unlisted > 0) changed = true;
    }
  } catch (error) {
    sourceWideFailure = true;
    const message = error instanceof Error ? error.message : String(error);
    if (!result.errors.includes(message)) result.errors.push(message);
  }

  // Unlike disappearance counters, freshness expiry must still run after an
  // incomplete or failed inventory. stale_after is the bounded guarantee that
  // an unreachable source cannot leave future Activity Graph content public
  // forever.
  try {
    const expiration = await expireStaleCandidates(supabase, source.id, now);
    result.unlisted += expiration.unlisted;
    if (expiration.unlisted > 0) changed = true;
  } catch (error) {
    sourceWideFailure = true;
    const message = error instanceof Error ? error.message : String(error);
    if (!result.errors.includes(message)) result.errors.push(message);
  }

  const previousConsecutiveFailures = Number(
    (source as ActivitySource & { consecutive_failures?: number })
      .consecutive_failures ?? 0,
  );
  const health = buildSourceHealthPatch({
    now,
    crawlIntervalMinutes: source.crawl_interval_minutes,
    previousConsecutiveFailures,
    usableActivities,
    sourceWideFailure,
    errors: result.errors,
    changed,
  });
  const { error: sourceUpdateError } = await supabase
    .from("activity_sources")
    .update(health.patch)
    .eq("id", source.id);
  if (sourceUpdateError) {
    result.errors.push(`Source health update: ${sourceUpdateError.message}`);
  }
  return result;
}
