import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { expandSearchQuery } from "@/lib/search/expand-query";

/**
 * Escape a search term for safe use in PostgREST .or() filters.
 * This prevents PostgREST filter injection attacks.
 */
function escapePostgrestValue(input: string): string {
  return input
    .replace(/[\x00-\x1f\x7f]/g, "") // Remove control characters
    .replace(/"/g, '""') // Escape double quotes (PostgREST uses double-quoted strings)
    .replace(/[%_]/g, "\\$&"); // Escape SQL LIKE wildcards
}

/**
 * Query published events matching any of the given terms.
 * Each term searches title, description, and location_name.
 * PostgREST reserved chars (commas, dots, parens) require double-quoted values
 */
async function fetchMatchingEvents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  terms: string[]
) {
  const orFilters = terms
    .map((term) => {
      // Escape to prevent PostgREST filter injection (both from user input and AI output)
      const escaped = escapePostgrestValue(term);
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
    throw new Error(`Search suggestions query failed: ${error.message}`);
  }

  return events || [];
}

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

  const supabase = await createClient();

  // Raw-term DB query and AI expansion run concurrently.
  // Expansion is cached (24h) and time-boxed (1.5s) inside expandSearchQuery;
  // extra expanded terms are queried only once expansion resolves.
  // Each leg fails independently: a dead raw query is a real outage (503),
  // a dead expansion leg only degrades results.
  const [rawResult, expandedResult] = await Promise.allSettled([
    fetchMatchingEvents(supabase, [query]),
    expandSearchQuery(query).then(async (expandedTerms) => {
      const extraTerms = expandedTerms.filter(
        (term) => term.toLowerCase() !== query.toLowerCase()
      );
      const events =
        extraTerms.length > 0
          ? await fetchMatchingEvents(supabase, extraTerms)
          : [];
      return { expandedTerms, events };
    }),
  ]);

  if (rawResult.status === "rejected") {
    console.error("Search suggestions raw query failed:", rawResult.reason);
    return NextResponse.json(
      { suggestions: [], degraded: true },
      { status: 503 }
    );
  }

  const rawEvents = rawResult.value;
  if (expandedResult.status === "rejected") {
    console.error(
      "Search suggestions expansion leg failed:",
      expandedResult.reason
    );
  }
  const expanded =
    expandedResult.status === "fulfilled"
      ? expandedResult.value
      : { expandedTerms: [] as string[], events: [] as typeof rawEvents };

  // Merge raw + expanded matches, dedupe by id, keep newest-first order
  const seen = new Set<string>();
  const events = [...rawEvents, ...expanded.events]
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    })
    .sort(
      (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
    )
    .slice(0, 6);

  // Categorize by lifecycle
  const now = new Date();
  const suggestions = events.map((event) => {
    const start = new Date(event.starts_at);
    // If no end date, assume event ends at end of start day
    const end = event.ends_at
      ? new Date(event.ends_at)
      : new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59);

    let lifecycle: "upcoming" | "happening" | "past";
    if (end < now) {
      lifecycle = "past";
    } else if (start <= now && end >= now) {
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
    expandedTerms:
      expanded.expandedTerms.length > 1 ? expanded.expandedTerms : undefined,
    // Flag partial results so the client can tell them apart from "no matches"
    ...(expandedResult.status === "rejected" ? { degraded: true } : {}),
  });
}
