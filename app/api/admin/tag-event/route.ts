import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tagEvent } from "@/lib/ai/event-tagger";

/**
 * POST /api/admin/tag-event
 * Auto-tag a single event using AI.
 * Allowed for: admins, moderators, or the event creator
 *
 * Body: { eventId: string }
 * Returns: { tags: string[], confidence: number }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Parse request
  const body = await request.json();
  const { eventId } = body;

  if (!eventId) {
    return NextResponse.json({ error: "missing_event_id" }, { status: 400 });
  }

  // Fetch the event (including created_by to check ownership)
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title, description, location_name, created_by")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  }

  // Check authorization: admin, moderator, or event creator
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin" || profile?.role === "moderator";
  const isCreator = event.created_by === user.id;

  if (!isAdmin && !isCreator) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  // Tag the event using AI
  const result = await tagEvent(event.title, event.description, event.location_name);

  // Update the event with tags
  const { error: updateError } = await supabase.rpc("update_event_tags", {
    p_event_id: eventId,
    p_tags: result.tags,
  });

  if (updateError) {
    console.error("Failed to update event tags:", updateError);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    eventId,
    tags: result.tags,
    confidence: result.confidence,
  });
}
