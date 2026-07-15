import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRoleLevel, type UserRole } from "@/lib/types";

/**
 * POST /api/admin/link-past-event
 * Link (or unlink) a past event whose published moments are showcased on the
 * target event's page until it has moments of its own. Admin only.
 *
 * Body: { eventId: string, linkedEventId: string | null }
 * Returns: { success: true }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { eventId, linkedEventId } = body as {
    eventId?: string;
    linkedEventId?: string | null;
  };

  if (!eventId) {
    return NextResponse.json({ error: "missing_event_id" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role
    ? hasRoleLevel(profile.role as UserRole, "admin")
    : false;

  if (!isAdmin) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  }

  if (linkedEventId) {
    if (linkedEventId === eventId) {
      return NextResponse.json({ error: "cannot_link_self" }, { status: 400 });
    }

    const { data: linkedEvent } = await supabase
      .from("events")
      .select("id, status, starts_at")
      .eq("id", linkedEventId)
      .single();

    if (!linkedEvent) {
      return NextResponse.json({ error: "linked_event_not_found" }, { status: 404 });
    }

    if (
      linkedEvent.status !== "published" ||
      new Date(linkedEvent.starts_at) > new Date()
    ) {
      return NextResponse.json({ error: "linked_event_not_past" }, { status: 400 });
    }
  }

  // RLS: events_update_admin allows admins to update any event
  const { error: updateError } = await supabase
    .from("events")
    .update({ linked_past_event_id: linkedEventId ?? null })
    .eq("id", eventId);

  if (updateError) {
    console.error("Failed to update linked past event:", updateError);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
