import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications";
import type { OrganizerRePingPayload } from "@/lib/notifications/types";

const RE_PING_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  // Verify user is the event creator
  const { data: event } = await supabase
    .from("events")
    .select("id, title, slug, created_by")
    .eq("slug", slug)
    .single();

  if (!event) {
    return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
  }

  if (event.created_by !== user.id) {
    return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  // Check rate limit
  const { data: config } = await supabase
    .from("event_reminder_config")
    .select("last_re_ping_at")
    .eq("event_id", event.id)
    .single();

  if (config?.last_re_ping_at) {
    const elapsed = Date.now() - new Date(config.last_re_ping_at).getTime();
    if (elapsed < RE_PING_COOLDOWN_MS) {
      return NextResponse.json({
        ok: false,
        error: "Please wait before sending another re-ping",
      }, { status: 429 });
    }
  }

  // Get organizer name
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const organizerName = profile?.display_name || "The organizer";

  // Get all "going" RSVPs where confirmed_at IS NULL
  const { data: pendingRsvps } = await supabase
    .from("rsvps")
    .select("user_id, profiles!inner(locale)")
    .eq("event_id", event.id)
    .eq("status", "going")
    .is("confirmed_at", null);

  if (!pendingRsvps || pendingRsvps.length === 0) {
    return NextResponse.json({ ok: true, notified: 0, message: "No pending attendees" });
  }

  // Send re-ping notifications in parallel to avoid Vercel function timeout
  const results = await Promise.allSettled(
    pendingRsvps.map((rsvp) => {
      const profileData = rsvp.profiles as unknown as { locale: string } | null;
      const payload: OrganizerRePingPayload = {
        type: "organizer_re_ping",
        userId: rsvp.user_id,
        locale: (profileData?.locale as OrganizerRePingPayload["locale"]) || "en",
        eventId: event.id,
        eventSlug: event.slug,
        eventTitle: event.title,
        organizerName,
      };
      return notify(payload);
    })
  );
  const notified = results.filter(
    (r) => r.status === "fulfilled" && r.value.success
  ).length;

  // Update last_re_ping_at (upsert into config table)
  await supabase
    .from("event_reminder_config")
    .upsert(
      { event_id: event.id, last_re_ping_at: new Date().toISOString() },
      { onConflict: "event_id" }
    );

  return NextResponse.json({ ok: true, notified });
}
