import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventSeries } from "@/lib/types";
import {
  generateMapsUrl,
  generateUniqueSlug,
  slugify,
} from "@/lib/import/utils";
import {
  dalatDateKey,
  materializeSeriesOccurrences,
  planSeriesOccurrences,
} from "@/lib/series/materialize";
import { pingIndexNow } from "@/lib/seo/indexnow";
import { locales } from "@/lib/i18n/routing";
import {
  activityMediaMetadata,
  activityProjectionImage,
  hasCuratedActivityMedia,
  projectedActivityMedia,
  sourceAllowsOfficialMedia,
} from "./media";
import { isLamVienTbdActivity } from "./lam-vien-tbd";
import {
  freshnessScore,
  scoreEventDuplicate,
  scoreSeriesDuplicate,
  type EventMatchRow,
  type SeriesMatchRow,
} from "./scoring";
import {
  sourceDescription,
  upsertActivityEventTranslations,
} from "./translations";
import type {
  ActivitySource,
  ConfidenceResult,
  DuplicateMatch,
  ExtractedActivity,
  LocalityResult,
} from "./types";

export interface ProjectionResult {
  status: "published" | "withheld" | "rejected" | "cancelled";
  decision: "publish" | "update" | "merge" | "withhold" | "reject";
  reason: string;
  eventId?: string;
  eventSeriesId?: string;
  duplicateMatches: DuplicateMatch[];
  publishedNew: boolean;
}

interface ProjectInput {
  supabase: SupabaseClient;
  source: ActivitySource;
  candidateId: string;
  observationId: string;
  activity: ExtractedActivity;
  confidence: ConfidenceResult;
  locality: LocalityResult;
  recordMergeDecision: boolean;
  now?: Date;
}

async function resolveCreatedBy(supabase: SupabaseClient): Promise<string> {
  if (process.env.IMPORT_CREATED_BY) return process.env.IMPORT_CREATED_BY;
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", "yan")
    .maybeSingle();
  if (error || !data?.id) {
    throw new Error("IMPORT_CREATED_BY not set and no 'yan' profile found");
  }
  return data.id;
}

async function resolveOrganizer(
  supabase: SupabaseClient,
  source: ActivitySource,
  activity: ExtractedActivity,
): Promise<string | null> {
  if (source.organizer_id) return source.organizer_id;
  if (!activity.organizerName) return null;
  const slug = slugify(activity.organizerName);
  if (!slug) return null;
  const { data: existing } = await supabase
    .from("organizers")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("organizers")
    .insert({
      slug,
      name: activity.organizerName,
      description: null,
      website_url: activity.organizerUrl,
      is_verified: false,
    })
    .select("id")
    .single();
  if (error) {
    // Concurrent first observation may have won the unique slug race.
    const { data: raced } = await supabase
      .from("organizers")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!raced?.id)
      throw new Error(`Organizer resolution failed: ${error.message}`);
    return raced.id;
  }
  if (created?.id) {
    await supabase
      .from("activity_sources")
      .update({ organizer_id: created.id })
      .eq("id", source.id);
  }
  return created?.id ?? null;
}

async function loadDuplicateMatches(
  supabase: SupabaseClient,
  activity: ExtractedActivity,
  organizerId: string | null,
): Promise<DuplicateMatch[]> {
  if (activity.kind === "recurring_activity") {
    const { data, error } = await supabase
      .from("event_series")
      .select(
        "id,title,starts_at_time,rrule,location_name,address,organizer_id,external_chat_url,source_platform",
      )
      // Only public canonical series participate in generic dedupe. A paused
      // graph row may be this candidate's crash-recovery draft; createSeries
      // must recover and fully materialize it instead of taking a merge shortcut.
      .eq("status", "active")
      .limit(250);
    if (error)
      throw new Error(`Series duplicate query failed: ${error.message}`);
    return ((data ?? []) as SeriesMatchRow[])
      .map((row) => scoreSeriesDuplicate(activity, row, organizerId))
      .filter((match) => match.score >= 50)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  if (!activity.startsAt) return [];
  const start = new Date(activity.startsAt);
  const from = new Date(start.getTime() - 24 * 60 * 60_000).toISOString();
  const to = new Date(start.getTime() + 24 * 60 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id,title,starts_at,location_name,address,organizer_id,external_chat_url,source_platform",
    )
    .gte("starts_at", from)
    .lte("starts_at", to)
    // Draft graph rows are incomplete projections, not canonical duplicates.
    // Keeping generic dedupe public-only lets createEvent recover its own
    // candidate-owned draft after a process interruption.
    .eq("status", "published")
    .limit(250);
  if (error) throw new Error(`Event duplicate query failed: ${error.message}`);
  return ((data ?? []) as EventMatchRow[])
    .map((row) => scoreEventDuplicate(activity, row, organizerId))
    .filter((match) => match.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

async function writeMergeDecision(
  input: ProjectInput,
  match: DuplicateMatch,
  decision: "linked" | "kept_distinct" | "withheld",
): Promise<void> {
  if (!input.recordMergeDecision) return;
  const { error } = await input.supabase
    .from("activity_merge_decisions")
    .insert({
      candidate_id: input.candidateId,
      event_id: match.targetType === "event" ? match.targetId : null,
      event_series_id: match.targetType === "series" ? match.targetId : null,
      classification: match.classification,
      score: match.score,
      feature_vector: match.features,
      decision,
      algorithm_version: "deterministic-v1",
      reason: match.reason,
    });
  if (error) throw new Error(`Merge-decision insert failed: ${error.message}`);
}

async function upsertCanonicalLink(
  input: ProjectInput,
  target: { eventId?: string; eventSeriesId?: string },
): Promise<void> {
  const now = (input.now ?? new Date()).toISOString();
  const { error } = await input.supabase
    .from("activity_canonical_links")
    .upsert(
      {
        source_id: input.source.id,
        candidate_id: input.candidateId,
        observation_id: input.observationId,
        event_id: target.eventId ?? null,
        event_series_id: target.eventSeriesId ?? null,
        relationship: "primary",
        is_primary: true,
        is_official: input.source.trust_tier === 1,
        selected_fields: input.activity.evidence.map((row) => row.fieldPath),
        last_checked_at: now,
        last_confirmed_at: now,
      },
      { onConflict: "candidate_id" },
    );
  if (error) throw new Error(`Canonical-link upsert failed: ${error.message}`);
}

function indexPaths(kind: "event" | "series", slug: string): string[] {
  const suffix = kind === "event" ? `events/${slug}` : `series/${slug}`;
  return locales.map((locale) =>
    locale === "en" ? `/${suffix}` : `/${locale}/${suffix}`,
  );
}

async function markCandidate(
  input: ProjectInput,
  result: ProjectionResult,
  duplicateStatus: "distinct" | "matched" | "ambiguous",
): Promise<void> {
  const now = (input.now ?? new Date()).toISOString();
  const { error } = await input.supabase
    .from("activity_candidates")
    .update({
      status: result.status,
      decision: result.decision,
      decision_reason: result.reason,
      duplicate_status: duplicateStatus,
      duplicate_matches: result.duplicateMatches,
      ...(result.publishedNew ? { published_at: now } : {}),
      last_checked_at: now,
      last_confirmed_at: result.status === "published" ? now : null,
      freshness_score:
        result.status === "published"
          ? freshnessScore(
              now,
              input.activity.kind === "recurring_activity" ? 7 : 14,
              1,
              input.now ?? new Date(),
            )
          : 0,
    })
    .eq("id", input.candidateId)
    .eq("latest_observation_id", input.observationId)
    .is("unlist_origin", null);
  if (error)
    throw new Error(`Candidate decision update failed: ${error.message}`);
}

async function finalizeCandidatePublication(
  input: ProjectInput,
  result: ProjectionResult,
  duplicateStatus: "distinct" | "matched",
  occurrenceDates: string[] | null = null,
): Promise<boolean> {
  const confirmedAt = input.now ?? new Date();
  const { data, error } = await input.supabase.rpc(
    "finalize_activity_candidate_publication",
    {
      p_candidate_id: input.candidateId,
      p_observation_id: input.observationId,
      p_decision: result.decision,
      p_reason: result.reason,
      p_duplicate_status: duplicateStatus,
      p_duplicate_matches: result.duplicateMatches,
      p_freshness_score: freshnessScore(
        confirmedAt.toISOString(),
        input.activity.kind === "recurring_activity" ? 7 : 14,
        1,
        confirmedAt,
      ),
      p_confirmed_at: confirmedAt.toISOString(),
      p_published_new: result.publishedNew,
      p_occurrence_dates: occurrenceDates,
    },
  );
  if (error)
    throw new Error(
      `Candidate publication finalization failed: ${error.message}`,
    );
  return Boolean(
    data &&
    typeof data === "object" &&
    "published" in data &&
    data.published === true,
  );
}

async function existingCanonicalLink(input: ProjectInput): Promise<{
  event_id: string | null;
  event_series_id: string | null;
} | null> {
  const { data, error } = await input.supabase
    .from("activity_canonical_links")
    .select("event_id,event_series_id")
    .eq("candidate_id", input.candidateId)
    .maybeSingle();
  if (error) throw new Error(`Canonical-link lookup failed: ${error.message}`);
  return data;
}

async function cancelLinkedActivity(
  input: ProjectInput,
  link: { event_id: string | null; event_series_id: string | null },
): Promise<ProjectionResult> {
  const { error: suppressionError } = await input.supabase.rpc(
    "suppress_activity_candidate_projection",
    {
      p_candidate_id: input.candidateId,
      p_hidden_at: (input.now ?? new Date()).toISOString(),
      p_event_status:
        input.activity.eventStatus === "cancelled" ? "cancelled" : "draft",
    },
  );
  if (suppressionError) {
    throw new Error(
      `Linked activity cancellation failed: ${suppressionError.message}`,
    );
  }
  const result: ProjectionResult = {
    status: "cancelled",
    decision: "update",
    reason: `Official source reports ${input.activity.eventStatus}`,
    eventId: link.event_id ?? undefined,
    eventSeriesId: link.event_series_id ?? undefined,
    duplicateMatches: [],
    publishedNew: false,
  };
  await markCandidate(input, result, "matched");
  return result;
}

async function withholdLinkedActivity(
  input: ProjectInput,
  link: { event_id: string | null; event_series_id: string | null },
  reason: string,
  status: "withheld" | "rejected" = "withheld",
): Promise<ProjectionResult> {
  const now = (input.now ?? new Date()).toISOString();
  // Keep the last-good projection for provenance, RSVPs, and possible recovery,
  // but remove it from every public discovery surface until deterministic
  // evidence passes again. The database helper preserves creator-managed
  // targets and targets still corroborated by another published candidate.
  const { error: suppressionError } = await input.supabase.rpc(
    "suppress_activity_candidate_projection",
    {
      p_candidate_id: input.candidateId,
      p_hidden_at: now,
      p_event_status: "draft",
    },
  );
  if (suppressionError) {
    throw new Error(
      `Linked activity safety-unlist failed: ${suppressionError.message}`,
    );
  }
  const result: ProjectionResult = {
    status,
    decision: status === "rejected" ? "reject" : "withhold",
    reason,
    eventId: link.event_id ?? undefined,
    eventSeriesId: link.event_series_id ?? undefined,
    duplicateMatches: [],
    publishedNew: false,
  };
  await markCandidate(input, result, "matched");
  return result;
}

type LinkedOccurrence = {
  id: string;
  series_instance_date: string | null;
  is_exception: boolean | null;
  starts_at: string;
};

function refreshedSourceMetadata(
  input: ProjectInput,
  existing: Record<string, unknown> | null | undefined,
  now: string,
): Record<string, unknown> {
  const media = projectedActivityMedia(input.source, input.activity);
  const preserveCurated = hasCuratedActivityMedia(existing) && !media?.provenance;
  const metadata: Record<string, unknown> = {
    ...(existing ?? {}),
    activity_source_id: input.source.id,
    activity_source_slug: input.source.slug,
    activity_candidate_id: input.candidateId,
    activity_observation_id: input.observationId,
    source_url: input.activity.sourceUrl,
    activity_attributes: input.activity.attributes,
    time_precision: input.activity.timePrecision,
    ...(isLamVienTbdActivity(input.activity)
      ? { schedule_policy: "lam_vien_date_known_time_tbd" }
      : {}),
    media_candidate_count: input.activity.mediaCandidates?.length ?? 0,
    media_policy:
      media?.policy ??
      (typeof input.source.metadata?.media_policy === "string"
        ? input.source.metadata.media_policy
        : "reference_only"),
    media_reuse_allowed:
      Boolean(media) || sourceAllowsOfficialMedia(input.source),
    ...activityMediaMetadata(preserveCurated ? null : media),
    confidence: input.confidence.score,
    locality: input.locality,
    published_automatically: true,
    verified_at: now,
  };
  if (
    !sourceAllowsOfficialMedia(input.source) &&
    !input.activity.curatedMedia &&
    !preserveCurated
  ) {
    delete metadata.activity_media_url;
    delete metadata.activity_media_gallery;
    delete metadata.activity_media_source_url;
    delete metadata.activity_media_attribution;
    delete metadata.activity_media_role;
    delete metadata.activity_media_policy;
  }
  return metadata;
}

async function reconcileActivityGraphSeries(
  input: ProjectInput,
  currentSeries: EventSeries,
  refreshedSeries: EventSeries,
  now: Date,
): Promise<{ occurrenceIds: string[]; occurrenceDates: string[] }> {
  const today = dalatDateKey(now);
  const { data: existing, error: existingError } = await input.supabase
    .from("events")
    .select("id,series_instance_date,is_exception,starts_at")
    .eq("series_id", currentSeries.id)
    .gte("series_instance_date", today);
  if (existingError) {
    throw new Error(
      `Linked series occurrence lookup failed: ${existingError.message}`,
    );
  }

  const occurrences = (existing ?? []) as LinkedOccurrence[];
  const desired = new Map(
    planSeriesOccurrences(refreshedSeries, 2, now).map((occurrence) => [
      occurrence.date,
      occurrence,
    ]),
  );

  // Put the projection in a safe non-public state before mutating individual
  // dates. If any later step fails, the series stays paused and no old schedule
  // is silently presented as current.
  const rowsToReconcile = occurrences.filter(
    (occurrence) =>
      !occurrence.is_exception &&
      ((occurrence.series_instance_date &&
        desired.has(occurrence.series_instance_date)) ||
        new Date(occurrence.starts_at).getTime() >= now.getTime()),
  );
  if (rowsToReconcile.length > 0) {
    const { error: draftError } = await input.supabase
      .from("events")
      .update({ status: "draft" })
      .in(
        "id",
        rowsToReconcile.map((occurrence) => occurrence.id),
      );
    if (draftError) {
      throw new Error(
        `Linked series occurrence safety-unlist failed: ${draftError.message}`,
      );
    }
  }

  const refreshedIds: string[] = [];
  for (const occurrence of occurrences) {
    if (occurrence.is_exception || !occurrence.series_instance_date) continue;
    const planned = desired.get(occurrence.series_instance_date);
    if (!planned) continue; // obsolete date remains draft, preserving its row/RSVPs

    const { error } = await input.supabase
      .from("events")
      .update({
        title: refreshedSeries.title,
        description: refreshedSeries.description,
        image_url: refreshedSeries.image_url,
        location_name: refreshedSeries.location_name,
        address: refreshedSeries.address,
        google_maps_url: refreshedSeries.google_maps_url,
        latitude: refreshedSeries.latitude,
        longitude: refreshedSeries.longitude,
        external_chat_url: refreshedSeries.external_chat_url,
        timezone: refreshedSeries.timezone,
        price_type: refreshedSeries.price_type,
        ticket_tiers: refreshedSeries.ticket_tiers,
        organizer_id: refreshedSeries.organizer_id,
        venue_id: refreshedSeries.venue_id ?? null,
        starts_at: planned.startsAt,
        ends_at: planned.endsAt,
        status: "draft",
        source_locale: "vi",
        source_platform: "activity-graph",
        source_metadata: refreshedSeries.source_metadata ?? {},
        activity_kind: refreshedSeries.activity_kind,
        public_access: refreshedSeries.public_access,
        reservation_requirement: refreshedSeries.reservation_requirement,
        last_checked_at: refreshedSeries.last_checked_at,
        last_confirmed_at: refreshedSeries.last_confirmed_at,
        source_updated_at: refreshedSeries.source_updated_at,
        freshness_score: refreshedSeries.freshness_score,
      })
      .eq("id", occurrence.id);
    if (error) {
      throw new Error(
        `Linked series occurrence refresh failed: ${error.message}`,
      );
    }
    refreshedIds.push(occurrence.id);
  }

  await materializeSeriesOccurrences(input.supabase, refreshedSeries, 2, {
    now,
    strict: true,
    occurrenceStatus: "draft",
  });

  let occurrenceIds: string[] = [];
  if (desired.size > 0) {
    const { data: future, error: futureError } = await input.supabase
      .from("events")
      .select("id")
      .eq("series_id", currentSeries.id)
      .in("series_instance_date", [...desired.keys()])
      .eq("is_exception", false);
    if (futureError) {
      throw new Error(
        `Linked series refreshed occurrence lookup failed: ${futureError.message}`,
      );
    }
    occurrenceIds = (future ?? [])
      .map((row) => row.id as string)
      .filter(Boolean);
  }
  return {
    occurrenceIds,
    occurrenceDates: [...desired.keys()],
  };
}

async function refreshLinkedActivity(
  input: ProjectInput,
  link: { event_id: string | null; event_series_id: string | null },
): Promise<ProjectionResult> {
  const projectionNow = input.now ?? new Date();
  const now = projectionNow.toISOString();
  const fresh = freshnessScore(
    now,
    input.activity.kind === "recurring_activity" ? 7 : 14,
    1,
    projectionNow,
  );
  let indexTarget: { kind: "event" | "series"; slug: string } | null = null;
  let occurrenceDates: string[] | null = null;
  if (link.event_id) {
    const { data: event, error: eventLookupError } = await input.supabase
      .from("events")
      .select(
        "id,source_platform,source_metadata,slug,image_url,image_alt,image_description",
      )
      .eq("id", link.event_id)
      .maybeSingle();
    if (eventLookupError || !event) {
      throw new Error(
        `Linked event lookup failed: ${eventLookupError?.message ?? "no row returned"}`,
      );
    }
    if (event?.source_platform === "activity-graph") {
      const currentMetadata = event.source_metadata as Record<
        string,
        unknown
      > | null;
      const media = projectedActivityMedia(input.source, input.activity);
      const update: Record<string, unknown> = {
        source_metadata: refreshedSourceMetadata(input, currentMetadata, now),
        title: input.activity.title,
        description: sourceDescription(input.activity, input.source.name),
        starts_at: input.activity.startsAt,
        ends_at: input.activity.endsAt,
        location_name: input.activity.locationName,
        address: input.activity.address,
        latitude: input.activity.latitude,
        longitude: input.activity.longitude,
        google_maps_url: generateMapsUrl(
          input.activity.latitude ?? undefined,
          input.activity.longitude ?? undefined,
          input.activity.locationName ?? undefined,
          "Đà Lạt",
        ),
        external_chat_url: input.activity.ticketUrl ?? input.activity.sourceUrl,
        price_type: input.activity.priceType,
        ticket_tiers: input.activity.ticketTiers,
        public_access: input.activity.publicAccess,
        reservation_requirement: input.activity.reservationRequirement,
        activity_kind: input.activity.kind,
        last_checked_at: now,
        last_confirmed_at: now,
        source_updated_at: input.activity.sourceUpdatedAt,
        freshness_score: fresh,
        image_url: activityProjectionImage({
          currentUrl: event.image_url,
          currentMetadata,
          media,
          mediaAllowed: sourceAllowsOfficialMedia(input.source),
        }),
        image_alt: media?.altText ?? event.image_alt,
        image_description: media?.caption ?? event.image_description,
      };
      const { error } = await input.supabase
        .from("events")
        .update(update)
        .eq("id", link.event_id);
      if (error)
        throw new Error(`Linked event refresh failed: ${error.message}`);
      await upsertActivityEventTranslations(
        input.supabase,
        [link.event_id],
        input.activity,
        input.source.name,
      );
      if (event.slug) indexTarget = { kind: "event", slug: event.slug };
    }
  }
  if (link.event_series_id) {
    const { data: series, error: seriesLookupError } = await input.supabase
      .from("event_series")
      .select("*")
      .eq("id", link.event_series_id)
      .maybeSingle();
    if (seriesLookupError || !series) {
      throw new Error(
        `Linked series lookup failed: ${seriesLookupError?.message ?? "no row returned"}`,
      );
    }

    if (series.source_platform === "activity-graph") {
      const currentMetadata = series.source_metadata as Record<
        string,
        unknown
      > | null;
      const media = projectedActivityMedia(input.source, input.activity);
      const sourceMetadata = refreshedSourceMetadata(
        input,
        currentMetadata,
        now,
      );
      const seriesUpdate: Partial<EventSeries> = {
        title: input.activity.title,
        description: sourceDescription(input.activity, input.source.name),
        location_name: input.activity.locationName,
        address: input.activity.address,
        google_maps_url: generateMapsUrl(
          input.activity.latitude ?? undefined,
          input.activity.longitude ?? undefined,
          input.activity.locationName ?? undefined,
          "Đà Lạt",
        ),
        latitude: input.activity.latitude,
        longitude: input.activity.longitude,
        external_chat_url: input.activity.ticketUrl ?? input.activity.sourceUrl,
        timezone: input.activity.timezone,
        price_type: input.activity.priceType,
        ticket_tiers: input.activity.ticketTiers,
        organizer_id: input.source.organizer_id ?? series.organizer_id,
        venue_id: input.source.venue_id ?? series.venue_id ?? null,
        rrule: input.activity.rrule!,
        starts_at_time: input.activity.startsAtTime!,
        duration_minutes: input.activity.durationMinutes ?? 120,
        first_occurrence: input.activity.firstOccurrence!,
        rrule_until: input.activity.rruleUntil,
        status: "paused",
        instances_generated_until: null,
        source_platform: "activity-graph",
        source_metadata: sourceMetadata,
        activity_kind: input.activity.kind,
        public_access: input.activity.publicAccess,
        reservation_requirement: input.activity.reservationRequirement,
        last_checked_at: now,
        last_confirmed_at: now,
        source_updated_at: input.activity.sourceUpdatedAt,
        freshness_score: fresh,
        image_url: activityProjectionImage({
          currentUrl: series.image_url,
          currentMetadata,
          media,
          mediaAllowed: sourceAllowsOfficialMedia(input.source),
        }),
      };
      const { error: pauseError } = await input.supabase
        .from("event_series")
        .update(seriesUpdate)
        .eq("id", link.event_series_id);
      if (pauseError)
        throw new Error(
          `Linked series template refresh failed: ${pauseError.message}`,
        );

      const refreshedSeries = { ...series, ...seriesUpdate } as EventSeries;
      const reconciliation = await reconcileActivityGraphSeries(
        input,
        series as EventSeries,
        refreshedSeries,
        projectionNow,
      );
      occurrenceDates = reconciliation.occurrenceDates;
      await upsertActivityEventTranslations(
        input.supabase,
        reconciliation.occurrenceIds,
        input.activity,
        input.source.name,
      );
      if (series.slug) indexTarget = { kind: "series", slug: series.slug };
    }
  }
  await upsertCanonicalLink(input, {
    eventId: link.event_id ?? undefined,
    eventSeriesId: link.event_series_id ?? undefined,
  });
  const result: ProjectionResult = {
    status: "published",
    decision: "update",
    reason: "Official source reconfirmed the published activity",
    eventId: link.event_id ?? undefined,
    eventSeriesId: link.event_series_id ?? undefined,
    duplicateMatches: [],
    publishedNew: false,
  };
  const published = await finalizeCandidatePublication(
    input,
    result,
    "matched",
    occurrenceDates,
  );
  if (!published) {
    return {
      ...result,
      status: "withheld",
      decision: "withhold",
      reason: "Administrative suppression won the publication race",
    };
  }
  if (indexTarget) {
    await pingIndexNow(indexPaths(indexTarget.kind, indexTarget.slug));
  }
  return result;
}

async function createEvent(
  input: ProjectInput,
  organizerId: string | null,
  createdBy: string,
): Promise<{ id: string; slug: string }> {
  if (!input.activity.startsAt)
    throw new Error("Cannot project an event without startsAt");
  const { data: existing, error: existingError } = await input.supabase
    .from("events")
    .select("id,slug,image_url,image_alt,image_description,source_metadata")
    .eq("activity_graph_candidate_id", input.candidateId)
    .maybeSingle();
  if (existingError)
    throw new Error(
      `Activity event recovery lookup failed: ${existingError.message}`,
    );
  const slug =
    existing?.slug ??
    (await generateUniqueSlug(input.supabase, slugify(input.activity.title)));
  const now = (input.now ?? new Date()).toISOString();
  const currentMetadata = existing?.source_metadata as Record<
    string,
    unknown
  > | null;
  const media = projectedActivityMedia(input.source, input.activity);
  const sourceMetadata = refreshedSourceMetadata(input, currentMetadata, now);
  const values = {
    slug,
    title: input.activity.title,
    description: sourceDescription(input.activity, input.source.name),
    image_url: activityProjectionImage({
      currentUrl: existing?.image_url,
      currentMetadata,
      media,
      mediaAllowed: sourceAllowsOfficialMedia(input.source),
    }),
    image_alt: media?.altText ?? existing?.image_alt,
    image_description: media?.caption ?? existing?.image_description,
    starts_at: input.activity.startsAt,
    ends_at: input.activity.endsAt,
    timezone: input.activity.timezone,
    location_name: input.activity.locationName,
    address: input.activity.address,
    latitude: input.activity.latitude,
    longitude: input.activity.longitude,
    google_maps_url: generateMapsUrl(
      input.activity.latitude ?? undefined,
      input.activity.longitude ?? undefined,
      input.activity.locationName ?? undefined,
      "Đà Lạt",
    ),
    venue_id: input.source.venue_id,
    organizer_id: organizerId,
    external_chat_url: input.activity.ticketUrl ?? input.activity.sourceUrl,
    price_type: input.activity.priceType,
    ticket_tiers: input.activity.ticketTiers,
    // Fail closed until provenance and the candidate decision are committed
    // together by finalize_activity_candidate_publication.
    status: "draft" as const,
    created_by: createdBy,
    source_locale: "vi",
    source_platform: "activity-graph",
    source_metadata: sourceMetadata,
    activity_graph_candidate_id: input.candidateId,
    activity_kind: input.activity.kind,
    public_access: input.activity.publicAccess,
    reservation_requirement: input.activity.reservationRequirement,
    last_checked_at: now,
    last_confirmed_at: now,
    source_updated_at: input.activity.sourceUpdatedAt,
    freshness_score: freshnessScore(now, 14),
  };
  const query = existing
    ? input.supabase.from("events").update(values).eq("id", existing.id)
    : input.supabase.from("events").insert(values);
  const { data, error } = await query.select("id,slug").single();
  if (error || !data) {
    throw new Error(
      `Activity event draft failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return data;
}

async function createSeries(
  input: ProjectInput,
  organizerId: string | null,
  createdBy: string,
): Promise<EventSeries> {
  if (
    !input.activity.rrule ||
    !input.activity.startsAtTime ||
    !input.activity.firstOccurrence
  ) {
    throw new Error("Cannot project an incomplete recurring activity");
  }
  const { data: existing, error: existingError } = await input.supabase
    .from("event_series")
    .select("*")
    .eq("activity_graph_candidate_id", input.candidateId)
    .maybeSingle();
  if (existingError)
    throw new Error(
      `Activity series recovery lookup failed: ${existingError.message}`,
    );
  let slug =
    existing?.slug ?? (slugify(input.activity.title) || "recurring-activity");
  if (!existing) {
    const baseSlug = slug;
    for (let counter = 1; ; counter++) {
      const { data } = await input.supabase
        .from("event_series")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!data) break;
      slug = `${baseSlug}-${counter}`;
    }
  }
  const projectionNow = input.now ?? new Date();
  const now = projectionNow.toISOString();
  const currentMetadata = existing?.source_metadata as Record<
    string,
    unknown
  > | null;
  const media = projectedActivityMedia(input.source, input.activity);
  const sourceMetadata = refreshedSourceMetadata(input, currentMetadata, now);
  const values = {
    slug,
    title: input.activity.title,
    description: sourceDescription(input.activity, input.source.name),
    image_url: activityProjectionImage({
      currentUrl: existing?.image_url,
      currentMetadata,
      media,
      mediaAllowed: sourceAllowsOfficialMedia(input.source),
    }),
    location_name: input.activity.locationName,
    address: input.activity.address,
    google_maps_url: generateMapsUrl(
      input.activity.latitude ?? undefined,
      input.activity.longitude ?? undefined,
      input.activity.locationName ?? undefined,
      "Đà Lạt",
    ),
    latitude: input.activity.latitude,
    longitude: input.activity.longitude,
    venue_id: input.source.venue_id,
    external_chat_url: input.activity.sourceUrl,
    timezone: input.activity.timezone,
    price_type: input.activity.priceType,
    ticket_tiers: input.activity.ticketTiers,
    organizer_id: organizerId,
    created_by: createdBy,
    rrule: input.activity.rrule,
    starts_at_time: input.activity.startsAtTime,
    duration_minutes: input.activity.durationMinutes ?? 120,
    first_occurrence: input.activity.firstOccurrence,
    rrule_until: input.activity.rruleUntil,
    status: "paused" as const,
    activity_graph_candidate_id: input.candidateId,
    activity_kind: input.activity.kind,
    public_access: input.activity.publicAccess,
    reservation_requirement: input.activity.reservationRequirement,
    last_checked_at: now,
    last_confirmed_at: now,
    source_updated_at: input.activity.sourceUpdatedAt,
    freshness_score: freshnessScore(now, 7, 1, projectionNow),
    source_platform: "activity-graph",
    source_metadata: sourceMetadata,
  };
  const query = existing
    ? input.supabase.from("event_series").update(values).eq("id", existing.id)
    : input.supabase.from("event_series").insert(values);
  const { data, error } = await query.select("*").single();
  if (error || !data) {
    throw new Error(
      `Activity series draft failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return data as EventSeries;
}

export async function projectActivity(
  input: ProjectInput,
): Promise<ProjectionResult> {
  const link = await existingCanonicalLink(input);
  if (link && ["cancelled", "postponed"].includes(input.activity.eventStatus)) {
    return cancelLinkedActivity(input, link);
  }

  const failureReason = input.confidence.hardGateFailures.join(", ");
  // A dated occurrence naturally becomes "past" while its canonical page
  // remains a useful archive. Every other gate still applies on refresh: an
  // existing link must never turn a malformed, moved, or restricted source
  // observation into a fresh public listing.
  const linkedGateFailures = input.confidence.hardGateFailures.filter(
    (failure) => failure !== "past_occurrence",
  );
  if (
    link?.event_series_id &&
    (input.activity.kind !== "recurring_activity" ||
      !input.activity.rrule ||
      !input.activity.startsAtTime ||
      !input.activity.firstOccurrence)
  ) {
    linkedGateFailures.push("linked_series_recurrence_incomplete");
  }
  if (link && linkedGateFailures.length > 0) {
    const permanentlyRejected = linkedGateFailures.some((failure) =>
      ["locality_outside", "event_cancelled", "event_postponed"].includes(
        failure,
      ),
    );
    return withholdLinkedActivity(
      input,
      link,
      `Automatic safety gate on refreshed source: ${linkedGateFailures.join(", ")}`,
      permanentlyRejected ? "rejected" : "withheld",
    );
  }
  if (link && input.confidence.score < input.source.auto_publish_threshold) {
    return withholdLinkedActivity(
      input,
      link,
      `Refreshed confidence ${input.confidence.score} below source threshold ${input.source.auto_publish_threshold}`,
    );
  }
  if (link) return refreshLinkedActivity(input, link);

  if (input.confidence.hardGateFailures.length > 0) {
    const permanentlyRejected = input.confidence.hardGateFailures.some(
      (failure) =>
        [
          "past_occurrence",
          "locality_outside",
          "event_cancelled",
          "event_postponed",
        ].includes(failure),
    );
    const result: ProjectionResult = {
      status: permanentlyRejected ? "rejected" : "withheld",
      decision: permanentlyRejected ? "reject" : "withhold",
      reason: `Automatic safety gate: ${failureReason}`,
      duplicateMatches: [],
      publishedNew: false,
    };
    await markCandidate(input, result, "distinct");
    return result;
  }
  if (input.confidence.score < input.source.auto_publish_threshold) {
    const result: ProjectionResult = {
      status: "withheld",
      decision: "withhold",
      reason: `Confidence ${input.confidence.score} below source threshold ${input.source.auto_publish_threshold}`,
      duplicateMatches: [],
      publishedNew: false,
    };
    await markCandidate(input, result, "distinct");
    return result;
  }

  const organizerId = await resolveOrganizer(
    input.supabase,
    input.source,
    input.activity,
  );
  const duplicateMatches = await loadDuplicateMatches(
    input.supabase,
    input.activity,
    organizerId,
  );
  const best = duplicateMatches[0];
  if (best?.classification === "same_occurrence") {
    await writeMergeDecision(input, best, "linked");
    await upsertCanonicalLink(input, {
      eventId: best.targetType === "event" ? best.targetId : undefined,
      eventSeriesId: best.targetType === "series" ? best.targetId : undefined,
    });
    const result: ProjectionResult = {
      status: "published",
      decision: "merge",
      reason: `Automatically linked to canonical ${best.targetType} (${best.reason})`,
      eventId: best.targetType === "event" ? best.targetId : undefined,
      eventSeriesId: best.targetType === "series" ? best.targetId : undefined,
      duplicateMatches,
      publishedNew: false,
    };
    const published = await finalizeCandidatePublication(
      input,
      result,
      "matched",
      best.targetType === "series" ? [] : null,
    );
    if (!published) {
      return {
        ...result,
        status: "withheld",
        decision: "withhold",
        reason: "Administrative suppression won the publication race",
      };
    }
    return result;
  }
  if (best && best.score >= 78) {
    await writeMergeDecision(input, best, "withheld");
    const result: ProjectionResult = {
      status: "withheld",
      decision: "withhold",
      reason:
        "Potential duplicate requires automatic corroboration before publication",
      duplicateMatches,
      publishedNew: false,
    };
    await markCandidate(input, result, "ambiguous");
    return result;
  }
  if (best) await writeMergeDecision(input, best, "kept_distinct");

  const createdBy = await resolveCreatedBy(input.supabase);
  if (input.activity.kind === "recurring_activity") {
    const series = await createSeries(input, organizerId, createdBy);
    await upsertCanonicalLink(input, { eventSeriesId: series.id });
    const projectionNow = input.now ?? new Date();
    const occurrenceDates = planSeriesOccurrences(series, 2, projectionNow).map(
      (occurrence) => occurrence.date,
    );
    await materializeSeriesOccurrences(input.supabase, series, 2, {
      now: projectionNow,
      strict: true,
      occurrenceStatus: "draft",
    });
    let occurrenceIds: string[] = [];
    if (occurrenceDates.length > 0) {
      const { data: occurrences, error: occurrenceError } = await input.supabase
        .from("events")
        .select("id")
        .eq("series_id", series.id)
        .in("series_instance_date", occurrenceDates)
        .eq("is_exception", false);
      if (occurrenceError) {
        throw new Error(
          `Activity occurrence lookup failed: ${occurrenceError.message}`,
        );
      }
      occurrenceIds = (occurrences ?? [])
        .map((row) => row.id as string)
        .filter(Boolean);
    }
    await upsertActivityEventTranslations(
      input.supabase,
      occurrenceIds,
      input.activity,
      input.source.name,
    );
    const result: ProjectionResult = {
      status: "published",
      decision: "publish",
      reason: `Automatically published from deterministic first-party evidence at confidence ${input.confidence.score}`,
      eventSeriesId: series.id,
      duplicateMatches,
      publishedNew: true,
    };
    const published = await finalizeCandidatePublication(
      input,
      result,
      "distinct",
      occurrenceDates,
    );
    if (!published) {
      return {
        ...result,
        status: "withheld",
        decision: "withhold",
        reason: "Administrative suppression won the publication race",
      };
    }
    await pingIndexNow(indexPaths("series", series.slug));
    return result;
  }

  const event = await createEvent(input, organizerId, createdBy);
  await upsertCanonicalLink(input, { eventId: event.id });
  await upsertActivityEventTranslations(
    input.supabase,
    [event.id],
    input.activity,
    input.source.name,
  );
  const result: ProjectionResult = {
    status: "published",
    decision: "publish",
    reason: `Automatically published from deterministic first-party evidence at confidence ${input.confidence.score}`,
    eventId: event.id,
    duplicateMatches,
    publishedNew: true,
  };
  const published = await finalizeCandidatePublication(
    input,
    result,
    "distinct",
  );
  if (!published) {
    return {
      ...result,
      status: "withheld",
      decision: "withhold",
      reason: "Administrative suppression won the publication race",
    };
  }
  await pingIndexNow(indexPaths("event", event.slug));
  return result;
}
