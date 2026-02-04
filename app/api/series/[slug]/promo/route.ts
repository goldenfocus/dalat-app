import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AISuggestedPromoMoment } from "@/lib/types";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

// GET /api/series/[slug]/promo - Get series promo media
export async function GET(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const supabase = await createClient();

  // Get series
  const { data: series, error: seriesError } = await supabase
    .from("event_series")
    .select("id, created_by")
    .eq("slug", slug)
    .single();

  if (seriesError || !series) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  // Use RPC to get series promo
  const { data: promo, error: promoError } = await supabase.rpc(
    "get_series_promo_media",
    { p_series_id: series.id }
  );

  if (promoError) {
    console.error("Error fetching series promo:", promoError);
    return NextResponse.json({ error: "Failed to fetch promo" }, { status: 500 });
  }

  // Check if current user is owner
  const { data: { user } } = await supabase.auth.getUser();
  const isOwner = user?.id === series.created_by;

  return NextResponse.json({
    promo: promo || [],
    seriesId: series.id,
    isOwner,
  });
}

// POST /api/series/[slug]/promo - Add promo to series
export async function POST(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get series
  const { data: series, error: seriesError } = await supabase
    .from("event_series")
    .select("id, created_by")
    .eq("slug", slug)
    .single();

  if (seriesError || !series) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  // Check ownership
  if (series.created_by !== user.id) {
    return NextResponse.json({ error: "Not series owner" }, { status: 403 });
  }

  const body = await request.json();
  const {
    moment_ids = [],
    media_items = [],
    clear_existing = false,
  } = body as {
    moment_ids?: string[];
    media_items?: Array<{
      media_type: string;
      media_url?: string;
      youtube_url?: string;
      youtube_video_id?: string;
      title?: string;
      caption?: string;
    }>;
    clear_existing?: boolean;
  };

  // Optionally clear existing promo
  if (clear_existing) {
    await supabase.from("promo_media").delete().eq("series_id", series.id);
  }

  // Get current max sort_order
  const { data: existing } = await supabase
    .from("promo_media")
    .select("sort_order")
    .eq("series_id", series.id)
    .order("sort_order", { ascending: false })
    .limit(1);

  let nextSortOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  // Import moments as promo
  for (const momentId of moment_ids) {
    await supabase.rpc("import_moment_as_promo", {
      p_moment_id: momentId,
      p_target_series_id: series.id,
      p_sort_order: nextSortOrder++,
    });
  }

  // Add direct media items
  if (media_items.length > 0) {
    const promoInserts = media_items.map((item, i) => ({
      series_id: series.id,
      media_type: item.media_type,
      media_url: item.media_url || null,
      youtube_url: item.youtube_url || null,
      youtube_video_id: item.youtube_video_id || null,
      title: item.title || null,
      caption: item.caption || null,
      sort_order: nextSortOrder + i,
      created_by: user.id,
    }));

    await supabase.from("promo_media").insert(promoInserts);
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/series/[slug]/promo - Remove series promo
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get series
  const { data: series, error: seriesError } = await supabase
    .from("event_series")
    .select("id, created_by")
    .eq("slug", slug)
    .single();

  if (seriesError || !series) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  // Check ownership
  if (series.created_by !== user.id) {
    return NextResponse.json({ error: "Not series owner" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const promoId = searchParams.get("id");

  if (promoId) {
    // Delete specific promo item
    await supabase
      .from("promo_media")
      .delete()
      .eq("id", promoId)
      .eq("series_id", series.id);
  } else {
    // Delete all series promo
    await supabase.from("promo_media").delete().eq("series_id", series.id);
  }

  return NextResponse.json({ success: true });
}
