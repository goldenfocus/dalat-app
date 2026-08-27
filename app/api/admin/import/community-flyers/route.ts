import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRoleLevel, type UserRole } from "@/lib/types";
import {
  COMMUNITY_FLYER_SOURCE,
  COMMUNITY_FLYER_TYPE,
  sanitizeCommunityFlyerRow,
} from "@/lib/import/community-flyer-review";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

type ModeratorAuthorization =
  | { ok: false; response: NextResponse }
  | { ok: true; admin: SupabaseClient; user: { id: string } };

async function authorizeModerator(): Promise<ModeratorAuthorization> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, response: jsonError("Authentication required", 401) };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const allowed = !profileError && profile?.role &&
    hasRoleLevel(profile.role as UserRole, "moderator");
  if (!allowed) return { ok: false, response: jsonError("Moderator access required", 403) };

  // Service-role access is constructed only after the signed-in user's role
  // has been verified with their normal session.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, response: jsonError("Service unavailable", 503) };
  const admin = createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { ok: true, admin, user: { id: user.id } };
}

export async function GET() {
  const authorization = await authorizeModerator();
  if (!authorization.ok) return authorization.response;

  const { data, error } = await authorization.admin
    .from("import_queue")
    .select("id, status, payload, created_at, error_detail")
    .eq("source", COMMUNITY_FLYER_SOURCE)
    .eq("type", COMMUNITY_FLYER_TYPE)
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) {
    console.error("[community-flyers] List failed:", error);
    return jsonError("Could not load flyer suggestions", 503);
  }

  return NextResponse.json({
    suggestions: (data ?? []).map(sanitizeCommunityFlyerRow).filter(Boolean),
  });
}

export async function PATCH(request: Request) {
  const authorization = await authorizeModerator();
  if (!authorization.ok) return authorization.response;

  let body: { id?: unknown; action?: unknown; eventId?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request", 400);
  }
  if (typeof body.id !== "string" || !UUID_RE.test(body.id)) {
    return jsonError("Invalid queue item", 400);
  }
  if (!["reject", "retry", "complete"].includes(String(body.action))) {
    return jsonError("Invalid action", 400);
  }

  const { data: row, error: rowError } = await authorization.admin
    .from("import_queue")
    .select("id, status, payload")
    .eq("id", body.id)
    .eq("source", COMMUNITY_FLYER_SOURCE)
    .eq("type", COMMUNITY_FLYER_TYPE)
    .in("status", ["pending", "failed"])
    .maybeSingle();
  if (rowError) return jsonError("Could not load queue item", 503);
  if (!row) return jsonError("Queue item not found", 404);

  const now = new Date().toISOString();
  const action = body.action as "reject" | "retry" | "complete";
  let update: Record<string, unknown>;

  if (action === "complete") {
    if (typeof body.eventId !== "string" || !UUID_RE.test(body.eventId)) {
      return jsonError("A valid created event is required", 400);
    }
    const { data: event, error: eventError } = await authorization.admin
      .from("events")
      .select("id")
      .eq("id", body.eventId)
      .maybeSingle();
    if (eventError) return jsonError("Could not verify the created event", 503);
    if (!event) return jsonError("Created event not found", 404);

    update = {
      status: "done",
      processed_at: now,
      error_detail: null,
      payload: {
        ...(row.payload && typeof row.payload === "object" ? row.payload : {}),
        reviewedBy: authorization.user.id,
        reviewedAt: now,
        createdEventId: body.eventId,
      },
    };
  } else if (action === "retry") {
    update = { status: "pending", processed_at: null, error_detail: null };
  } else {
    update = {
      status: "failed",
      processed_at: now,
      error_detail: "Rejected by moderator",
    };
  }

  const { error: updateError } = await authorization.admin
    .from("import_queue")
    .update(update)
    .eq("id", row.id)
    .eq("source", COMMUNITY_FLYER_SOURCE)
    .eq("type", COMMUNITY_FLYER_TYPE);
  if (updateError) {
    console.error("[community-flyers] Update failed:", updateError);
    return jsonError("Could not update flyer suggestion", 503);
  }
  return NextResponse.json({ ok: true, status: update.status });
}
