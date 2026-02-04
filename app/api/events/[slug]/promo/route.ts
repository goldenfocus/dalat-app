import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EventPromoMedia, PromoUpdateScope } from "@/lib/types";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

// GET /api/events/[slug]/promo - Get promo media with inheritance
export async function GET(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const supabase = await createClient();

  // Get event ID from slug
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, series_id, has_promo_override, created_by")
    .eq("slug", slug)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Use RPC to get promo with inheritance
  const { data: promo, error: promoError } = await supabase.rpc(
    "get_event_promo_media",
    { p_event_id: event.id }
  );

  if (promoError) {
    console.error("Error fetching promo:", promoError);
    return NextResponse.json({ error: "Failed to fetch promo" }, { status: 500 });
  }

  // Check if current user is owner
  const { data: { user } } = await supabase.auth.getUser();
  const isOwner = user?.id === event.created_by;

  return NextResponse.json({
    promo: promo as EventPromoMedia[],
    hasOverride: event.has_promo_override,
    seriesId: event.series_id,
    isOwner,
  });
}

// POST /api/events/[slug]/promo - Add promo media
export async function POST(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get event
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, series_id, created_by")
    .eq("slug", slug)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Check ownership
  if (event.created_by !== user.id) {
    return NextResponse.json({ error: "Not event owner" }, { status: 403 });
  }

  const body = await request.json();
  const {
    scope = "this_event",
    moment_ids = [],
    media_items = [],
  } = body as {
    scope?: PromoUpdateScope;
    moment_ids?: string[];
    media_items?: Array<{
      media_type: string;
      media_url?: string;
      youtube_url?: string;
      youtube_video_id?: string;
      title?: string;
      caption?: string;
    }>;
  };

  // Handle scope for series events
  if (event.series_id && scope !== "this_event") {
    // Update series promo and clear overrides for affected events
    return handleSeriesPromoUpdate(
      supabase,
      event.series_id,
      event.id,
      scope,
      moment_ids,
      media_items,
      user.id
    );
  }

  // Single event or "this_event" scope - set override flag if series event
  if (event.series_id) {
    await supabase
      .from("events")
      .update({ has_promo_override: true })
      .eq("id", event.id);
  }

  // Import moments as promo
  for (let i = 0; i < moment_ids.length; i++) {
    await supabase.rpc("import_moment_as_promo", {
      p_moment_id: moment_ids[i],
      p_target_event_id: event.id,
      p_sort_order: i,
    });
  }

  // Add direct media items
  if (media_items.length > 0) {
    const promoInserts = media_items.map((item, i) => ({
      event_id: event.id,
      media_type: item.media_type,
      media_url: item.media_url || null,
      youtube_url: item.youtube_url || null,
      youtube_video_id: item.youtube_video_id || null,
      title: item.title || null,
      caption: item.caption || null,
      sort_order: moment_ids.length + i,
      created_by: user.id,
    }));

    await supabase.from("promo_media").insert(promoInserts);
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/events/[slug]/promo - Remove promo media
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get event
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, created_by")
    .eq("slug", slug)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Check ownership
  if (event.created_by !== user.id) {
    return NextResponse.json({ error: "Not event owner" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const promoId = searchParams.get("id");

  if (promoId) {
    // Delete specific promo item
    await supabase
      .from("promo_media")
      .delete()
      .eq("id", promoId)
      .eq("event_id", event.id);
  } else {
    // Delete all event promo
    await supabase.from("promo_media").delete().eq("event_id", event.id);
  }

  return NextResponse.json({ success: true });
}

// Helper: Update series promo with scope
async function handleSeriesPromoUpdate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  seriesId: string,
  sourceEventId: string,
  scope: PromoUpdateScope,
  momentIds: string[],
  mediaItems: Array<{
    media_type: string;
    media_url?: string;
    youtube_url?: string;
    youtube_video_id?: string;
    title?: string;
    caption?: string;
  }>,
  userId: string
) {
  // Delete existing series promo
  await supabase.from("promo_media").delete().eq("series_id", seriesId);

  // Import moments as series promo
  for (let i = 0; i < momentIds.length; i++) {
    await supabase.rpc("import_moment_as_promo", {
      p_moment_id: momentIds[i],
      p_target_series_id: seriesId,
      p_sort_order: i,
    });
  }

  // Add direct media items to series
  if (mediaItems.length > 0) {
    const promoInserts = mediaItems.map((item, i) => ({
      series_id: seriesId,
      media_type: item.media_type,
      media_url: item.media_url || null,
      youtube_url: item.youtube_url || null,
      youtube_video_id: item.youtube_video_id || null,
      title: item.title || null,
      caption: item.caption || null,
      sort_order: momentIds.length + i,
      created_by: userId,
    }));

    await supabase.from("promo_media").insert(promoInserts);
  }

  // Clear overrides based on scope
  if (scope === "future") {
    // Clear future event overrides, delete their promo
    const { data: affectedEvents } = await supabase
      .from("events")
      .update({ has_promo_override: false })
      .eq("series_id", seriesId)
      .gt("starts_at", new Date().toISOString())
      .select("id");

    if (affectedEvents?.length) {
      const eventIds = affectedEvents.map((e) => e.id);
      await supabase.from("promo_media").delete().in("event_id", eventIds);
    }
  } else if (scope === "all") {
    // Clear ALL event overrides, delete all event promo
    const { data: affectedEvents } = await supabase
      .from("events")
      .update({ has_promo_override: false })
      .eq("series_id", seriesId)
      .select("id");

    if (affectedEvents?.length) {
      const eventIds = affectedEvents.map((e) => e.id);
      await supabase.from("promo_media").delete().in("event_id", eventIds);
    }
  }

  return NextResponse.json({ success: true, scope });
}
