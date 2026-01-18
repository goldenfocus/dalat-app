import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { expandSearchQuery } from "@/lib/search/expand-query";

/**
 * GET /api/search/suggestions?q=query
 * Returns lightweight event suggestions for instant search
 * Uses AI to expand queries with translations and synonyms
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  // Expand query with AI (translations + synonyms)
  const expandedTerms = await expandSearchQuery(query);

  const supabase = await createClient();

  // Build OR filter for all expanded terms
  // Each term searches title, description, and location_name
  // PostgREST reserved chars (commas, dots, parens) require double-quoted values
  const orFilters = expandedTerms
    .map((term) => {
      // Escape double quotes by doubling, then escape SQL wildcards
      const escaped = term.replace(/"/g, '""').replace(/[%_]/g, "\\$&");
      return `title.ilike."%${escaped}%",description.ilike."%${escaped}%",location_name.ilike."%${escaped}%"`;
    })
    .join(",");

  const { data: events, error } = await supabase
    .from("events")
    .select("id, slug, title, starts_at, ends_at, location_name, image_url")
    .eq("status", "published")
    .or(orFilters)
    .order("starts_at", { ascending: false })
    .limit(6);

  if (error) {
    console.error("Search suggestions error:", error);
    return NextResponse.json({ suggestions: [], expandedTerms });
  }

  // Categorize by lifecycle
  const now = new Date();
  const suggestions = (events || []).map((event) => {
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

  return NextResponse.json({
    suggestions,
    // Include expanded terms for debugging/transparency
    expandedTerms: expandedTerms.length > 1 ? expandedTerms : undefined,
  });
}
