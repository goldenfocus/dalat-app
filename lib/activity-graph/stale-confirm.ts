import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSourceText, type FetchedSourceDocument } from "./fetch";
import { extractDuoiTanAcoustic, extractSchemaOrgEvents } from "./parsers";
import { freshnessScore } from "./scoring";
import {
  httpStatusFromFetchError,
  isGoneHttpStatus,
  isHomepageRedirect,
  SOURCE_REMOVED_UNLIST_WINDOW_HOURS,
} from "./source-removal";
import type {
  ActivitySource,
  ExtractedActivity,
} from "./types";

export const MAX_STALE_CONFIRMS_PER_RUN = 8;
export const STALE_CONFIRM_TIMEOUT_MS = 8_000;

export interface StaleCandidateSnapshot {
  id: string;
  source_id: string;
  source_uid: string;
  source_url: string;
  activity_kind: string;
  status: string;
  unlist_origin: "admin" | "system_stale" | null;
  stale_after: string | null;
  starts_at: string | null;
}

export type StaleConfirmAction =
  | {
      type: "ingest";
      activity: ExtractedActivity;
      document: FetchedSourceDocument;
    }
  | { type: "reset_freshness" }
  | { type: "unlist"; reason: string }
  | { type: "skip"; reason: string };

export interface StaleConfirmResult {
  unlisted: number;
  confirmed: number;
  freshnessReset: number;
  skipped: number;
  seenSourceUids: string[];
}

export {
  httpStatusFromFetchError,
  isGoneHttpStatus,
} from "./source-removal";

export function sameSourceResource(
  requestedUrl: string,
  fetchedUrl: string,
): boolean {
  try {
    const requested = new URL(requestedUrl);
    const fetched = new URL(fetchedUrl);
    if (requested.origin !== fetched.origin) return false;
    const normalize = (path: string) => path.replace(/\/+$/, "") || "/";
    return normalize(requested.pathname) === normalize(fetched.pathname);
  } catch {
    return false;
  }
}

export function matchingExtractedActivity(
  activities: ExtractedActivity[],
  candidate: Pick<StaleCandidateSnapshot, "source_uid" | "source_url">,
): ExtractedActivity | undefined {
  return activities.find(
    (activity) =>
      activity.sourceUid === candidate.source_uid ||
      activity.sourceUrl === candidate.source_url ||
      sameSourceResource(activity.sourceUrl, candidate.source_url) ||
      sameSourceResource(activity.sourceUid, candidate.source_uid),
  );
}

export function extractActivitiesForConfirmation(
  source: ActivitySource,
  document: FetchedSourceDocument,
  now: Date,
): ExtractedActivity[] {
  if (source.fetch_mode === "verified_recurring_page") {
    return source.slug === "duoi-tan-anh-dao"
      ? extractDuoiTanAcoustic(document.text, document.url, now)
      : [];
  }
  return extractSchemaOrgEvents(document.text, document.url);
}

export function decideStaleConfirmation(
  candidate: StaleCandidateSnapshot,
  observation:
    | { ok: false; error: unknown }
    | {
        ok: true;
        document: FetchedSourceDocument;
        activities: ExtractedActivity[];
      },
  now: Date = new Date(),
): StaleConfirmAction {
  if (candidate.unlist_origin === "admin") {
    return { type: "skip", reason: "admin_unlist" };
  }

  if (!observation.ok) {
    const status = httpStatusFromFetchError(observation.error);
    if (status !== null && isGoneHttpStatus(status)) {
      if (candidate.status !== "published") {
        return { type: "skip", reason: "already_unlisted_gone" };
      }
      return {
        type: "unlist",
        reason: `Automatically unlisted after the source page returned HTTP ${status}`,
      };
    }
    return { type: "skip", reason: "transient_fetch_error" };
  }

  if (isHomepageRedirect(candidate.source_url, observation.document.url)) {
    // The homepage is not this activity's page: never ingest or "confirm"
    // from it. Unlist only once the night is close; until then keep it
    // published and re-check (a page can be re-posted or restored).
    if (candidate.status !== "published") {
      return { type: "skip", reason: "already_unlisted_redirected" };
    }
    const startMs = candidate.starts_at ? Date.parse(candidate.starts_at) : NaN;
    if (
      Number.isFinite(startMs) &&
      startMs - now.getTime() >
        SOURCE_REMOVED_UNLIST_WINDOW_HOURS * 3_600_000
    ) {
      return { type: "skip", reason: "source_removed_grace" };
    }
    return {
      type: "unlist",
      reason:
        "Automatically unlisted after the source page was removed (redirects to the homepage)",
    };
  }

  if (!sameSourceResource(candidate.source_url, observation.document.url)) {
    if (candidate.status !== "published") {
      return { type: "skip", reason: "already_unlisted_redirected" };
    }
    return {
      type: "unlist",
      reason:
        "Automatically unlisted after the source page no longer hosts this activity",
    };
  }

  const match = matchingExtractedActivity(observation.activities, candidate);
  if (match) {
    if (match.eventStatus === "cancelled" || match.eventStatus === "postponed") {
      if (candidate.status !== "published") {
        return { type: "skip", reason: "already_unlisted_cancelled" };
      }
      return {
        type: "unlist",
        reason: `Official source reports ${match.eventStatus}`,
      };
    }
    return {
      type: "ingest",
      activity: match,
      document: observation.document,
    };
  }

  // A live same-URL page still confirms the listing exists. Do not unlist
  // only because stale_after elapsed; a parser miss is not a cancellation.
  if (candidate.status === "published") {
    return { type: "reset_freshness" };
  }
  return { type: "skip", reason: "unlisted_without_extractable_schedule" };
}

export function candidateFreshnessWindowDays(activityKind: string): {
  staleDays: number;
  halfLifeDays: number;
} {
  return activityKind === "recurring_activity"
    ? { staleDays: 14, halfLifeDays: 7 }
    : { staleDays: 7, halfLifeDays: 14 };
}

type IngestVerifiedActivity = (
  supabase: SupabaseClient,
  source: ActivitySource,
  activity: ExtractedActivity,
  document: FetchedSourceDocument,
  now: Date,
) => Promise<unknown>;

function emptyResult(): StaleConfirmResult {
  return {
    unlisted: 0,
    confirmed: 0,
    freshnessReset: 0,
    skipped: 0,
    seenSourceUids: [],
  };
}

function isRecoverableSystemStale(
  candidate: StaleCandidateSnapshot,
  now: Date,
): boolean {
  if (candidate.status !== "unlisted") return false;
  if (candidate.unlist_origin !== "system_stale") return false;
  if (!candidate.starts_at) return true;
  const startsAt = new Date(candidate.starts_at);
  return !Number.isNaN(startsAt.getTime()) && startsAt.getTime() >= now.getTime();
}

export async function confirmOrExpireStaleCandidates(
  supabase: SupabaseClient,
  now: Date,
  options: {
    sourceId?: string;
    sources?: ActivitySource[];
    ingestActivity: IngestVerifiedActivity;
  },
): Promise<StaleConfirmResult> {
  const result = emptyResult();
  const nowIso = now.toISOString();
  // Filter inline. A generic helper over PostgrestFilterBuilder makes
  // `tsc` fail with "Type instantiation is excessively deep".
  let publishedQuery = supabase
    .from("activity_candidates")
    .select(
      "id,source_id,source_uid,source_url,activity_kind,status,unlist_origin,stale_after,starts_at",
    )
    .eq("status", "published")
    .not("stale_after", "is", null)
    .lte("stale_after", nowIso);
  if (options.sourceId) {
    publishedQuery = publishedQuery.eq("source_id", options.sourceId);
  }
  let unlistedQuery = supabase
    .from("activity_candidates")
    .select(
      "id,source_id,source_uid,source_url,activity_kind,status,unlist_origin,stale_after,starts_at",
    )
    .eq("status", "unlisted")
    .eq("unlist_origin", "system_stale")
    .or(`starts_at.is.null,starts_at.gte.${nowIso}`);
  if (options.sourceId) {
    unlistedQuery = unlistedQuery.eq("source_id", options.sourceId);
  }

  const [published, unlisted] = await Promise.all([
    publishedQuery.limit(MAX_STALE_CONFIRMS_PER_RUN),
    unlistedQuery.limit(MAX_STALE_CONFIRMS_PER_RUN),
  ]);
  if (published.error) {
    throw new Error(`Stale candidate lookup failed: ${published.error.message}`);
  }
  if (unlisted.error) {
    throw new Error(
      `System-stale candidate lookup failed: ${unlisted.error.message}`,
    );
  }

  const candidates = [
    ...((published.data ?? []) as StaleCandidateSnapshot[]),
    ...((unlisted.data ?? []) as StaleCandidateSnapshot[]).filter((candidate) =>
      isRecoverableSystemStale(candidate, now),
    ),
  ].slice(0, MAX_STALE_CONFIRMS_PER_RUN);
  if (candidates.length === 0) return result;

  const sourceById = new Map<string, ActivitySource>();
  for (const source of options.sources ?? []) {
    sourceById.set(source.id, source);
  }
  const missingSourceIds = [
    ...new Set(
      candidates
        .map((candidate) => candidate.source_id)
        .filter((sourceId) => !sourceById.has(sourceId)),
    ),
  ];
  if (missingSourceIds.length > 0) {
    const { data: sourceRows, error: sourceError } = await supabase
      .from("activity_sources")
      .select("*")
      .in("id", missingSourceIds);
    if (sourceError) {
      throw new Error(
        `Stale candidate source lookup failed: ${sourceError.message}`,
      );
    }
    for (const source of (sourceRows ?? []) as ActivitySource[]) {
      sourceById.set(source.id, source);
    }
  }

  for (const candidate of candidates) {
    const source = sourceById.get(candidate.source_id);
    if (!source || !candidate.source_url) {
      result.skipped++;
      continue;
    }

    let observation:
      | { ok: false; error: unknown }
      | {
          ok: true;
          document: FetchedSourceDocument;
          activities: ExtractedActivity[];
        };
    try {
      const document = await fetchSourceText(source, candidate.source_url, {
        timeoutMs: STALE_CONFIRM_TIMEOUT_MS,
      });
      observation = {
        ok: true,
        document,
        activities: extractActivitiesForConfirmation(source, document, now),
      };
    } catch (fetchError) {
      observation = { ok: false, error: fetchError };
    }

    const decision = decideStaleConfirmation(candidate, observation, now);
    if (decision.type === "ingest") {
      await options.ingestActivity(
        supabase,
        source,
        decision.activity,
        decision.document,
        now,
      );
      result.confirmed++;
      result.seenSourceUids.push(candidate.source_uid);
      continue;
    }
    if (decision.type === "reset_freshness") {
      await resetPublishedCandidateFreshness(supabase, candidate, now);
      result.freshnessReset++;
      result.seenSourceUids.push(candidate.source_uid);
      continue;
    }
    if (decision.type === "unlist") {
      await unlistConfirmedGoneCandidate(
        supabase,
        candidate.id,
        now,
        decision.reason,
      );
      result.unlisted++;
      continue;
    }
    result.skipped++;
  }

  return result;
}

async function resetPublishedCandidateFreshness(
  supabase: SupabaseClient,
  candidate: StaleCandidateSnapshot,
  now: Date,
): Promise<void> {
  const { staleDays, halfLifeDays } = candidateFreshnessWindowDays(
    candidate.activity_kind,
  );
  const nowIso = now.toISOString();
  const { error } = await supabase
    .from("activity_candidates")
    .update({
      last_checked_at: nowIso,
      last_confirmed_at: nowIso,
      last_seen_at: nowIso,
      stale_after: new Date(now.getTime() + staleDays * 86_400_000).toISOString(),
      freshness_score: freshnessScore(nowIso, halfLifeDays, 1, now),
      missing_runs: 0,
    })
    .eq("id", candidate.id)
    .eq("status", "published")
    .is("unlist_origin", null);
  if (error) {
    throw new Error(`Stale candidate freshness reset failed: ${error.message}`);
  }
}

async function unlistConfirmedGoneCandidate(
  supabase: SupabaseClient,
  candidateId: string,
  now: Date,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc(
    "apply_activity_candidate_system_unlist",
    {
      p_candidate_ids: [candidateId],
      p_unlisted_at: now.toISOString(),
      p_reason: reason,
      p_future_events_only: true,
    },
  );
  if (error) {
    throw new Error(
      `Confirmed-gone candidate unlist failed: ${error.message}`,
    );
  }
}
