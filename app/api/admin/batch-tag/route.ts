import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tagEventsBatch } from "@/lib/ai/event-tagger";

/**
 * POST /api/admin/batch-tag
 * Batch tag multiple events using AI.
 * Useful for initial tagging of existing events.
 *
 * Body: { limit?: number, untaggedOnly?: boolean }
 * Returns: { processed: number, results: Array<{ eventId, tags }> }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Only admins can batch tag (rate limiting/cost concerns)
  if (profile?.role !== "admin" && profile?.role !== "superadmin") {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  // Parse request
  const body = await request.json();
  const { limit = 50, untaggedOnly = true } = body;

  // Fetch events to tag
  let query = supabase
    .from("events")
    .select("id, title, description, location_name")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 100)); // Cap at 100 per request

  if (untaggedOnly) {
    query = query.or("ai_tags.is.null,ai_tags.eq.{}");
  }

  const { data: events, error: fetchError } = await query;

  if (fetchError) {
    console.error("Failed to fetch events:", fetchError);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  if (!events || events.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      message: "No events to tag",
    });
  }

  // Batch tag events
  const resultsMap = await tagEventsBatch(events);

  // Update all events with their tags
  const updateResults: Array<{ eventId: string; tags: string[] }> = [];

  for (const [eventId, result] of resultsMap) {
    if (result.tags.length > 0) {
      const { error: updateError } = await supabase.rpc("update_event_tags", {
        p_event_id: eventId,
        p_tags: result.tags,
      });

      if (!updateError) {
        updateResults.push({ eventId, tags: result.tags });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    processed: updateResults.length,
    total: events.length,
    results: updateResults,
  });
}
