import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addMonths, format } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { generateSeriesInstances, isValidRRule } from "@/lib/recurrence";

interface TicketTier {
  name: string;
  price: number;
  currency: string;
  description?: string;
}

interface CreateSeriesRequest {
  title: string;
  description?: string;
  image_url?: string;
  location_name?: string;
  address?: string;
  google_maps_url?: string;
  latitude?: number;
  longitude?: number;
  external_chat_url?: string;
  is_online?: boolean;
  online_link?: string;
  title_position?: "top" | "middle" | "bottom";
  image_fit?: "cover" | "contain";
  focal_point?: string | null;
  capacity?: number;
  price_type?: "free" | "paid" | "donation" | null;
  ticket_tiers?: TicketTier[] | null;
  tribe_id?: string;
  organizer_id?: string;
  venue_id?: string; // Link to venues table (WHERE the event happens)
  rrule: string;
  starts_at_time: string; // "19:00" or "19:00:00"
  duration_minutes?: number;
  first_occurrence: string; // "2025-01-14"
  rrule_until?: string; // ISO date
  rrule_count?: number;
}

const DALAT_TIMEZONE = "Asia/Ho_Chi_Minh";
const DEFAULT_DURATION_MINUTES = 120;
const GENERATE_MONTHS_AHEAD = 6;

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function generateSeriesSlug(title: string, attempt = 0): string {
  const base = sanitizeSlug(title);
  // Use longer suffix on retries to reduce collision chance
  const suffixLength = attempt === 0 ? 4 : 6;
  const suffix = Math.random().toString(36).slice(2, 2 + suffixLength);
  return `${base}-${suffix}`;
}

/**
 * POST /api/series - Create a new recurring event series
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body: CreateSeriesRequest = await request.json();

  // Validation
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  if (!body.rrule || !isValidRRule(body.rrule)) {
    return NextResponse.json({ error: "Invalid recurrence rule" }, { status: 400 });
  }

  if (!body.starts_at_time) {
    return NextResponse.json({ error: "Start time is required" }, { status: 400 });
  }

  if (!body.first_occurrence) {
    return NextResponse.json({ error: "First occurrence date is required" }, { status: 400 });
  }

  // Normalize time to HH:MM:SS format
  const timeparts = body.starts_at_time.split(":");
  const normalizedTime =
    timeparts.length === 2
      ? `${timeparts[0]}:${timeparts[1]}:00`
      : body.starts_at_time;

  const durationMinutes = body.duration_minutes || DEFAULT_DURATION_MINUTES;
  const MAX_SLUG_RETRIES = 3;

  let series: any = null;
  let seriesSlug = "";
  let seriesError: any = null;

  // Retry loop to handle slug collisions
  for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
    seriesSlug = generateSeriesSlug(body.title, attempt);

    const result = await supabase
      .from("event_series")
      .insert({
        slug: seriesSlug,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        image_url: body.image_url || null,
        location_name: body.location_name?.trim() || null,
        address: body.address?.trim() || null,
        google_maps_url: body.google_maps_url || null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        external_chat_url: body.external_chat_url || null,
        is_online: body.is_online || false,
        online_link: body.is_online ? (body.online_link || null) : null,
        title_position: body.title_position || "bottom",
        image_fit: body.image_fit || "cover",
        focal_point: body.focal_point || null,
        timezone: DALAT_TIMEZONE,
        capacity: body.capacity || null,
        price_type: body.price_type || null,
        ticket_tiers: body.ticket_tiers || null,
        tribe_id: body.tribe_id || null,
        organizer_id: body.organizer_id || null,
        created_by: user.id,
        rrule: body.rrule,
        starts_at_time: normalizedTime,
        duration_minutes: durationMinutes,
        first_occurrence: body.first_occurrence,
        rrule_until: body.rrule_until || null,
        rrule_count: body.rrule_count || null,
        status: "active",
      })
      .select()
      .single();

    if (!result.error) {
      series = result.data;
      break;
    }

    // Check if it's a unique constraint violation (code 23505)
    if (result.error.code === "23505" && attempt < MAX_SLUG_RETRIES - 1) {
      console.log(`[series] Slug collision on "${seriesSlug}", retrying...`);
      continue;
    }

    seriesError = result.error;
    break;
  }

  try {
    if (seriesError) {
      console.error("Series creation error:", seriesError);
      return NextResponse.json(
        {
          error: "Failed to create series",
          details: seriesError.message,
          code: seriesError.code,
        },
        { status: 500 }
      );
    }

    if (!series) {
      return NextResponse.json(
        { error: "Failed to create series after retries" },
        { status: 500 }
      );
    }

    // Generate instances for the next N months
    const generateFrom = new Date(body.first_occurrence);
    const generateUntil = addMonths(new Date(), GENERATE_MONTHS_AHEAD);

    const occurrenceDates = generateSeriesInstances(
      {
        rrule: body.rrule,
        first_occurrence: body.first_occurrence,
        rrule_until: body.rrule_until || null,
        rrule_count: body.rrule_count || null,
      },
      generateFrom,
      generateUntil
    );

    // Create event instances
    const eventInserts = occurrenceDates.map((date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      const instanceSlug = `${seriesSlug}-${format(date, "yyyyMMdd")}`;

      // Combine date and time in Đà Lạt timezone, then convert to UTC
      const localDateTime = `${dateStr}T${normalizedTime}`;
      const startsAt = fromZonedTime(localDateTime, DALAT_TIMEZONE);
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

      return {
        slug: instanceSlug,
        series_id: series.id,
        series_instance_date: dateStr,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        image_url: body.image_url || null,
        location_name: body.location_name?.trim() || null,
        address: body.address?.trim() || null,
        google_maps_url: body.google_maps_url || null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        external_chat_url: body.external_chat_url || null,
        is_online: body.is_online || false,
        online_link: body.is_online ? (body.online_link || null) : null,
        title_position: body.title_position || "bottom",
        image_fit: body.image_fit || "cover",
        focal_point: body.focal_point || null,
        timezone: DALAT_TIMEZONE,
        capacity: body.capacity || null,
        price_type: body.price_type || null,
        ticket_tiers: body.ticket_tiers || null,
        tribe_id: body.tribe_id || null,
        organizer_id: body.organizer_id || null,
        venue_id: body.venue_id || null, // Link to venue (WHERE)
        created_by: user.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "published" as const,
        is_exception: false,
      };
    });

    let firstEventId: string | null = null;

    if (eventInserts.length > 0) {
      // Note: Can't use .order() on insert results unless the column is in select()
      // The eventInserts array is already ordered by date from generateSeriesInstances
      const { data: createdEvents, error: eventsError } = await supabase
        .from("events")
        .insert(eventInserts)
        .select("id, starts_at")
        .order("starts_at", { ascending: true });

      if (eventsError) {
        console.error("Events creation error:", eventsError);
        // Series was created but events failed - clean up
        await supabase.from("event_series").delete().eq("id", series.id);
        return NextResponse.json(
          {
            error: "Failed to create event instances",
            details: eventsError.message,
            code: eventsError.code,
            hint: eventsError.hint,
          },
          { status: 500 }
        );
      }

      // Get the first event ID for sponsor linking
      firstEventId = createdEvents?.[0]?.id || null;

      // Update the series with generation watermark
      await supabase
        .from("event_series")
        .update({ instances_generated_until: generateUntil.toISOString() })
        .eq("id", series.id);
    }

    return NextResponse.json({
      success: true,
      series,
      slug: series.slug,
      first_event_id: firstEventId,
      instances_created: eventInserts.length,
    });
  } catch (error) {
    console.error("Create series error:", error);
    return NextResponse.json(
      { error: "Failed to create series" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/series - List series for the current user
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get series (either all active or user's own)
  const query = supabase
    .from("event_series")
    .select(
      `
      *,
      profiles:created_by (display_name, avatar_url),
      organizers:organizer_id (name, logo_url)
    `
    )
    .order("created_at", { ascending: false });

  // If not authenticated, only show active series
  if (!user) {
    query.eq("status", "active");
  } else {
    // Show active series OR user's own series
    const showOwn = searchParams.get("own") === "true";
    if (showOwn) {
      query.eq("created_by", user.id);
    } else {
      query.eq("status", "active");
    }
  }

  const limit = parseInt(searchParams.get("limit") || "20", 10);
  query.limit(limit);

  const { data: series, error } = await query;

  if (error) {
    console.error("Series fetch error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch series",
        details: error.message,
        code: error.code,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ series });
}
