import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AISuggestedPromoMoment } from "@/lib/types";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

// GET /api/series/[slug]/promo/suggest - Get AI-suggested moments for promo
export async function GET(request: NextRequest, context: RouteContext) {
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

  // Get limit from query params
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "10", 10);

  // Use RPC to get AI-suggested moments
  const { data: suggestions, error: suggestError } = await supabase.rpc(
    "get_ai_suggested_promo",
    { p_series_id: series.id, p_limit: limit }
  );

  if (suggestError) {
    console.error("Error fetching suggestions:", suggestError);
    return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 });
  }

  return NextResponse.json({
    suggestions: (suggestions || []) as AISuggestedPromoMoment[],
  });
}
