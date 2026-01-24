import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromZonedTime } from "date-fns-tz";
import { isValidRRule } from "@/lib/recurrence";

const DALAT_TIMEZONE = "Asia/Ho_Chi_Minh";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/series/[slug] - Get series details with upcoming events
 */
export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  // Get series
  const { data: series, error: seriesError } = await supabase
    .from("event_series")
    .select(
      `
      *,
      profiles:created_by (id, display_name, avatar_url, username),
      organizers:organizer_id (id, name, slug, logo_url),
      tribes:tribe_id (id, name, slug)
    `
    )
    .eq("slug", slug)
    .single();

  if (seriesError || !series) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  // Get upcoming events count
  const upcomingLimit = parseInt(searchParams.get("upcoming_limit") || "5", 10);

  const { data: upcomingEvents } = await supabase
    .from("events")
    .select("id, slug, starts_at, series_instance_date, status")
    .eq("series_id", series.id)
    .eq("status", "published")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(upcomingLimit);

  // Get series exceptions
  const { data: exceptions } = await supabase
    .from("series_exceptions")
    .select("original_date, exception_type, reason")
    .eq("series_id", series.id);

  // Get subscriber count
  const { count: subscriberCount } = await supabase
    .from("series_rsvps")
    .select("*", { count: "exact", head: true })
    .eq("series_id", series.id)
    .eq("auto_rsvp", true);

  // Check if current user is subscribed
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isSubscribed = false;
  if (user) {
    const { data: subscription } = await supabase
      .from("series_rsvps")
      .select("auto_rsvp")
      .eq("series_id", series.id)
      .eq("user_id", user.id)
      .single();

    isSubscribed = subscription?.auto_rsvp ?? false;
  }

  return NextResponse.json({
    series,
    upcoming_events: upcomingEvents || [],
    exceptions: exceptions || [],
    subscriber_count: subscriberCount || 0,
    is_subscribed: isSubscribed,
    is_owner: user?.id === series.created_by,
  });
}

/**
 * PATCH /api/series/[slug] - Update series
 */
export async function PATCH(request: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get series and check ownership
  const { data: series, error: fetchError } = await supabase
    .from("event_series")
    .select("id, created_by, rrule, first_occurrence, starts_at_time, duration_minutes")
    .eq("slug", slug)
    .single();

  if (fetchError || !series) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  if (series.created_by !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const { update_scope, ...updateData } = body;

  // Validate RRULE if being updated
  if (updateData.rrule && !isValidRRule(updateData.rrule)) {
    return NextResponse.json({ error: "Invalid recurrence rule" }, { status: 400 });
  }

  // Update series template
  const allowedFields = [
    "title",
    "description",
    "image_url",
    "location_name",
    "address",
    "google_maps_url",
    "external_chat_url",
    "capacity",
    "rrule",
    "starts_at_time",
    "duration_minutes",
    "rrule_until",
    "rrule_count",
    "status",
  ];

  const seriesUpdate: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in updateData) {
      seriesUpdate[field] = updateData[field];
    }
  }

  if (Object.keys(seriesUpdate).length > 0) {
    const { error: updateError } = await supabase
      .from("event_series")
      .update(seriesUpdate)
      .eq("id", series.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update series: " + updateError.message },
        { status: 500 }
      );
    }
  }

  // Update future event instances if requested
  if (update_scope === "future" || update_scope === "all") {
    const eventFields = [
      "title",
      "description",
      "image_url",
      "location_name",
      "address",
      "google_maps_url",
      "external_chat_url",
      "capacity",
    ];

    const eventUpdate: Record<string, unknown> = {};
    for (const field of eventFields) {
      if (field in updateData) {
        eventUpdate[field] = updateData[field];
      }
    }

    if (Object.keys(eventUpdate).length > 0) {
      let query = supabase
        .from("events")
        .update(eventUpdate)
        .eq("series_id", series.id)
        .eq("is_exception", false); // Don't update manually modified instances

      if (update_scope === "future") {
        query = query.gt("starts_at", new Date().toISOString());
      }

      await query;
    }

    // If time changed, update start/end times for future non-exception events
    if (updateData.starts_at_time || updateData.duration_minutes) {
      const newTime = updateData.starts_at_time || series.starts_at_time;
      const newDuration = updateData.duration_minutes || series.duration_minutes;

      // Get future events to update
      const { data: eventsToUpdate } = await supabase
        .from("events")
        .select("id, series_instance_date")
        .eq("series_id", series.id)
        .eq("is_exception", false)
        .gt("starts_at", new Date().toISOString());

      if (eventsToUpdate) {
        for (const event of eventsToUpdate) {
          const localDateTime = `${event.series_instance_date}T${newTime}`;
          const startsAt = fromZonedTime(localDateTime, DALAT_TIMEZONE);
          const endsAt = new Date(startsAt.getTime() + newDuration * 60 * 1000);

          await supabase
            .from("events")
            .update({
              starts_at: startsAt.toISOString(),
              ends_at: endsAt.toISOString(),
            })
            .eq("id", event.id);
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/series/[slug] - Cancel or delete series
 */
export async function DELETE(request: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get series and check ownership
  const { data: series, error: fetchError } = await supabase
    .from("event_series")
    .select("id, created_by")
    .eq("slug", slug)
    .single();

  if (fetchError || !series) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  if (series.created_by !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const deleteScope = searchParams.get("scope") || "future"; // future | all | series_only

  if (deleteScope === "all") {
    // Cancel all events in series (past and future)
    await supabase
      .from("events")
      .update({ status: "cancelled" })
      .eq("series_id", series.id);
  } else if (deleteScope === "future") {
    // Cancel only future events
    await supabase
      .from("events")
      .update({ status: "cancelled" })
      .eq("series_id", series.id)
      .gt("starts_at", new Date().toISOString());
  }

  // Mark series as cancelled
  await supabase
    .from("event_series")
    .update({ status: "cancelled" })
    .eq("id", series.id);

  return NextResponse.json({ success: true });
}
