import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifySpam, shouldAutoHide } from "@/lib/ai/spam-classifier";

/**
 * POST /api/admin/spam-check
 * Check if an event is spam and optionally auto-hide.
 * Allowed for: admins, moderators, or the event creator
 *
 * Body: { eventId: string, autoHide?: boolean }
 * Returns: { isSpam: boolean, confidence: number, reason: string, autoHidden?: boolean }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Parse request
  const body = await request.json();
  const { eventId, autoHide = true } = body;

  if (!eventId) {
    return NextResponse.json({ error: "missing_event_id" }, { status: 400 });
  }

  // Fetch the event (including created_by to check ownership)
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title, description, status, created_by")
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

  // Classify spam
  const result = await classifySpam(event.title, event.description);

  // Update spam score
  const { error: updateError } = await supabase.rpc("update_event_spam_score", {
    p_event_id: eventId,
    p_score: result.confidence,
    p_reason: result.reason,
  });

  if (updateError) {
    console.error("Failed to update spam score:", updateError);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // Auto-hide if enabled and spam confidence is high
  let autoHidden = false;
  if (autoHide && shouldAutoHide(result) && event.status === "published") {
    const { error: hideError } = await supabase
      .from("events")
      .update({ status: "draft" })
      .eq("id", eventId);

    if (!hideError) {
      autoHidden = true;
    }
  }

  return NextResponse.json({
    ok: true,
    eventId,
    isSpam: result.isSpam,
    confidence: result.confidence,
    reason: result.reason,
    autoHidden,
  });
}
