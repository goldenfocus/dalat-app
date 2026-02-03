import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/tags
 * Returns tag counts for upcoming events.
 */
export async function GET() {
  const supabase = await createClient();

  // Try to use the RPC function for tag counts
  const { data, error } = await supabase.rpc("get_tag_counts");

  if (error) {
    // Fallback: manually count tags if RPC doesn't exist yet
    if (error.code === "PGRST202") {
      const { data: events } = await supabase
        .from("events")
        .select("ai_tags")
        .eq("status", "published")
        .gt("starts_at", new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString());

      if (!events) {
        return NextResponse.json({ tags: {} });
      }

      const counts: Record<string, number> = {};
      for (const event of events) {
        const tags = event.ai_tags as string[] | null;
        if (tags && Array.isArray(tags)) {
          for (const tag of tags) {
            counts[tag] = (counts[tag] || 0) + 1;
          }
        }
      }

      return NextResponse.json(
        { tags: counts },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
          },
        }
      );
    }

    console.error("Error fetching tag counts:", error);
    return NextResponse.json({ tags: {} });
  }

  // Convert array of {tag, count} to object
  const counts: Record<string, number> = {};
  if (data) {
    for (const row of data) {
      counts[row.tag] = Number(row.count);
    }
  }

  return NextResponse.json(
    { tags: counts },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    }
  );
}
