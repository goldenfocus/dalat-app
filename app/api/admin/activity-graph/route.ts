import { NextResponse } from "next/server";
import {
  createClient as createAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { authorizeImportModerator } from "@/lib/import/moderator-authorization";
import { pingIndexNow } from "@/lib/seo/indexnow";
import { locales } from "@/lib/i18n/routing";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET() {
  const authorization = await authorizeImportModerator();
  if (!authorization.ok) return authorization.response;
  const admin = adminClient();
  if (!admin) return jsonError("Service unavailable", 503);

  const { data: candidates, error: candidateError } = await admin
    .from("activity_candidates")
    .select(
      "id,source_id,source_uid,source_url,activity_kind,title,starts_at,ends_at,rrule,starts_at_time,duration_minutes,location_name,address,organizer_name,public_access,normalized_payload,confidence_score,confidence_components,freshness_score,locality_status,duplicate_status,duplicate_matches,decision,decision_reason,status,discovered_at,last_checked_at,last_confirmed_at,source_updated_at,published_at,admin_action_at",
    )
    .order("last_checked_at", { ascending: false })
    .limit(100);
  if (candidateError) {
    console.error(
      "[activity-graph/admin] Candidate query failed:",
      candidateError,
    );
    return jsonError("Could not load Activity Graph", 503);
  }

  const candidateIds = (candidates ?? []).map((candidate) => candidate.id);
  const sourceIds = [
    ...new Set((candidates ?? []).map((candidate) => candidate.source_id)),
  ];
  const [sourcesResult, evidenceResult, linksResult] = await Promise.all([
    admin
      .from("activity_sources")
      .select(
        "id,slug,name,canonical_url,fetch_mode,access_basis,trust_tier,policy_status,status,auto_publish_enabled,auto_publish_threshold,next_check_at,last_checked_at,last_success_at,last_changed_at,last_error_at,error_detail",
      )
      .order("trust_tier", { ascending: true }),
    candidateIds.length > 0
      ? admin
          .from("activity_evidence")
          .select(
            "candidate_id,field_path,normalized_value,evidence_text,evidence_locator,confidence,observed_at",
          )
          .in("candidate_id", candidateIds)
          .order("field_path", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    candidateIds.length > 0
      ? admin
          .from("activity_canonical_links")
          .select(
            "candidate_id,event_id,event_series_id,last_checked_at,last_confirmed_at",
          )
          .in("candidate_id", candidateIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sourcesResult.error || evidenceResult.error || linksResult.error) {
    console.error("[activity-graph/admin] Detail query failed:", {
      sources: sourcesResult.error,
      evidence: evidenceResult.error,
      links: linksResult.error,
      sourceIds,
    });
    return jsonError("Could not load Activity Graph details", 503);
  }

  const evidenceByCandidate = new Map<string, typeof evidenceResult.data>();
  for (const row of evidenceResult.data ?? []) {
    const existing = evidenceByCandidate.get(row.candidate_id) ?? [];
    existing.push(row);
    evidenceByCandidate.set(row.candidate_id, existing);
  }
  const linksByCandidate = new Map(
    (linksResult.data ?? []).map((row) => [row.candidate_id, row]),
  );
  const sourceById = new Map(
    (sourcesResult.data ?? []).map((row) => [row.id, row]),
  );

  return NextResponse.json({
    candidates: (candidates ?? []).map((candidate) => ({
      ...candidate,
      source: sourceById.get(candidate.source_id) ?? null,
      evidence: evidenceByCandidate.get(candidate.id) ?? [],
      canonicalLink: linksByCandidate.get(candidate.id) ?? null,
    })),
    sources: sourcesResult.data ?? [],
    stats: {
      total: candidates?.length ?? 0,
      published: (candidates ?? []).filter(
        (candidate) => candidate.status === "published",
      ).length,
      withheld: (candidates ?? []).filter(
        (candidate) => candidate.status === "withheld",
      ).length,
      unlisted: (candidates ?? []).filter(
        (candidate) => candidate.status === "unlisted",
      ).length,
      errors: (sourcesResult.data ?? []).filter((source) => source.error_detail)
        .length,
    },
  });
}

function canonicalPaths(kind: "events" | "series", slug: string): string[] {
  return locales.map((locale) =>
    locale === "en" ? `/${kind}/${slug}` : `/${locale}/${kind}/${slug}`,
  );
}

export async function PATCH(request: Request) {
  const authorization = await authorizeImportModerator();
  if (!authorization.ok) return authorization.response;
  const admin = adminClient();
  if (!admin) return jsonError("Service unavailable", 503);

  let body: { action?: unknown; candidateId?: unknown; sourceId?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request", 400);
  }
  const action = typeof body.action === "string" ? body.action : "";
  const now = new Date().toISOString();

  if (["pause_source", "resume_source"].includes(action)) {
    if (typeof body.sourceId !== "string" || !UUID_RE.test(body.sourceId)) {
      return jsonError("Invalid source", 400);
    }
    const status = action === "pause_source" ? "paused" : "active";
    const sourceUpdate =
      action === "resume_source" ? { status, next_check_at: now } : { status };
    const { data, error } = await admin
      .from("activity_sources")
      .update(sourceUpdate)
      .eq("id", body.sourceId)
      .select("id,status")
      .maybeSingle();
    if (error) return jsonError("Could not update source", 503);
    if (!data) return jsonError("Source not found", 404);
    return NextResponse.json({ ok: true, source: data });
  }

  if (!["unlist", "recheck"].includes(action))
    return jsonError("Invalid action", 400);
  if (typeof body.candidateId !== "string" || !UUID_RE.test(body.candidateId)) {
    return jsonError("Invalid activity", 400);
  }
  const { data: candidate, error: candidateError } = await admin
    .from("activity_candidates")
    .select("id,source_id,status")
    .eq("id", body.candidateId)
    .maybeSingle();
  if (candidateError) return jsonError("Could not load activity", 503);
  if (!candidate) return jsonError("Activity not found", 404);

  if (action === "recheck") {
    if (candidate.status === "unlisted") {
      return jsonError("Activity is unlisted", 409);
    }
    const { error: candidateUpdateError } = await admin
      .from("activity_candidates")
      .update({
        decision_reason: "Automatic recheck requested by administrator",
        next_check_at: now,
        admin_action_by: authorization.user.id,
        admin_action_at: now,
      })
      .eq("id", candidate.id);
    if (candidateUpdateError)
      return jsonError("Could not schedule recheck", 503);
    const { error: sourceUpdateError } = await admin
      .from("activity_sources")
      .update({ next_check_at: now })
      .eq("id", candidate.source_id);
    if (sourceUpdateError)
      return jsonError("Could not schedule source recheck", 503);
    return NextResponse.json({ ok: true, status: candidate.status });
  }

  const { data: link, error: linkError } = await admin
    .from("activity_canonical_links")
    .select("event_id,event_series_id")
    .eq("candidate_id", candidate.id)
    .maybeSingle();
  if (linkError) return jsonError("Could not load published activity", 503);
  let indexPaths: string[] = [];
  if (link?.event_id) {
    const { data: event, error } = await admin
      .from("events")
      .select("slug")
      .eq("id", link.event_id)
      .maybeSingle();
    if (error) return jsonError("Could not load event", 503);
    if (event?.slug) indexPaths = canonicalPaths("events", event.slug);
  }
  if (link?.event_series_id) {
    const { data: series, error: seriesError } = await admin
      .from("event_series")
      .select("slug")
      .eq("id", link.event_series_id)
      .maybeSingle();
    if (seriesError) return jsonError("Could not load recurring activity", 503);
    if (series?.slug) indexPaths = canonicalPaths("series", series.slug);
  }
  const { data: unlistResult, error: updateError } = await admin.rpc(
    "admin_unlist_activity_candidate",
    {
      p_candidate_id: candidate.id,
      p_admin_id: authorization.user.id,
      p_unlisted_at: now,
    },
  );
  if (updateError) return jsonError("Could not unlist activity", 503);
  const result =
    unlistResult && typeof unlistResult === "object"
      ? (unlistResult as Record<string, unknown>)
      : {};
  if (result.projection_hidden === true && indexPaths.length > 0) {
    await pingIndexNow(indexPaths);
  }
  return NextResponse.json({
    ok: true,
    status: "unlisted",
    projectionHidden: result.projection_hidden === true,
    targetOwnedByActivityGraph: result.target_owned_by_activity_graph === true,
  });
}
