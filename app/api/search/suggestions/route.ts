import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/search/suggestions?q=query
 * Returns lightweight event suggestions for instant search
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const supabase = await createClient();

  // Lightweight query - just what we need for suggestions
  const { data: events, error } = await supabase
    .from("events")
    .select("id, slug, title, starts_at, ends_at, location_name, image_url")
    .eq("status", "published")
    .or(`title.ilike.%${query}%,description.ilike.%${query}%,location_name.ilike.%${query}%`)
    .order("starts_at", { ascending: false })
    .limit(6);

  if (error) {
    console.error("Search suggestions error:", error);
    return NextResponse.json({ suggestions: [] });
  }

  // Categorize by lifecycle
  const now = new Date();
  const suggestions = events.map((event) => {
    const start = new Date(event.starts_at);
    const end = event.ends_at ? new Date(event.ends_at) : null;

    let lifecycle: "upcoming" | "happening" | "past";
    if (end && end < now) {
      lifecycle = "past";
    } else if (start <= now && (!end || end >= now)) {
      lifecycle = "happening";
    } else {
      lifecycle = "upcoming";
    }

    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      location: event.location_name,
      imageUrl: event.image_url,
      startsAt: event.starts_at,
      lifecycle,
    };
  });

  return NextResponse.json({ suggestions });
}
