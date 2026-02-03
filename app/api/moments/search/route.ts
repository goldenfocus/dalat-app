import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Replicate from "replicate";

// CLIP model on Replicate - same as embed route (krthr/clip-embeddings works correctly)
const CLIP_MODEL = "krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4";

const RATE_LIMIT = 30; // searches per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Create a service role Supabase client for embedding lookup.
 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  return createSupabaseClient(url, serviceKey);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const threshold = parseFloat(searchParams.get("threshold") || "0.5");

    if (!query?.trim()) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    // Auth check (optional - can allow anonymous search)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Rate limiting for authenticated users
    if (user) {
      const { data: rateCheck, error: rateError } = await supabase.rpc('check_rate_limit', {
        p_action: 'moment_search',
        p_limit: RATE_LIMIT,
        p_window_ms: RATE_WINDOW_MS,
      });

      if (rateError) {
        console.error("[search] Rate limit check failed:", rateError);
      } else if (!rateCheck?.allowed) {
        return NextResponse.json(
          {
            error: "Rate limit exceeded. Try again later.",
            remaining: 0,
            reset_at: rateCheck?.reset_at,
          },
          { status: 429 }
        );
      }
    }

    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateToken) {
      console.error("[search] Replicate API token not configured");
      return NextResponse.json(
        { error: "Search service not configured" },
        { status: 503 }
      );
    }

    const replicate = new Replicate({ auth: replicateToken });

    // Generate embedding for the search query text
    const rawOutput = await replicate.run(CLIP_MODEL, {
      input: { text: query.trim() },
    });

    // Parse response - krthr model returns {embedding: [...]}
    let queryEmbedding: number[];
    if (rawOutput && typeof rawOutput === "object" && !Array.isArray(rawOutput) && (rawOutput as { embedding?: number[] }).embedding) {
      // krthr/clip-embeddings returns {embedding: [...]}
      queryEmbedding = (rawOutput as { embedding: number[] }).embedding;
    } else if (Array.isArray(rawOutput) && rawOutput.length > 0 && rawOutput[0]?.embedding) {
      // andreasjansson model returns [{embedding: [...]}]
      queryEmbedding = rawOutput[0].embedding;
    } else if (Array.isArray(rawOutput) && rawOutput.length === 768 && typeof rawOutput[0] === "number") {
      queryEmbedding = rawOutput;
    } else {
      console.error("[search] Unexpected query embedding response format");
      return NextResponse.json(
        { error: "Failed to process search query" },
        { status: 500 }
      );
    }

    if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length !== 768) {
      console.error("[search] Invalid query embedding length:", queryEmbedding?.length);
      return NextResponse.json(
        { error: "Failed to process search query" },
        { status: 500 }
      );
    }

    // Use service client for vector search (bypasses RLS for embeddings)
    const serviceClient = createServiceClient();
    if (!serviceClient) {
      return NextResponse.json(
        { error: "Service configuration error" },
        { status: 503 }
      );
    }

    // Format embedding for pgvector
    const embeddingString = `[${queryEmbedding.join(",")}]`;

    // Search using vector similarity
    const { data: searchResults, error: searchError } = await serviceClient.rpc(
      "search_moments_by_embedding",
      {
        query_embedding: embeddingString,
        match_threshold: threshold,
        match_count: limit,
      }
    );

    if (searchError) {
      console.error("[search] Vector search failed:", searchError);
      return NextResponse.json(
        { error: "Search failed" },
        { status: 500 }
      );
    }

    if (!searchResults || searchResults.length === 0) {
      return NextResponse.json({
        query,
        results: [],
        count: 0,
      });
    }

    // Fetch full moment details for the matching IDs
    const momentIds = searchResults.map((r: { moment_id: string }) => r.moment_id);
    const similarityMap = new Map(
      searchResults.map((r: { moment_id: string; similarity: number }) => [r.moment_id, r.similarity])
    );

    // Fetch moments with their event and user data
    // Use explicit FK hint to disambiguate from events.cover_moment_id relationship
    const { data: moments, error: momentsError } = await supabase
      .from("moments")
      .select(`
        id,
        event_id,
        user_id,
        content_type,
        media_url,
        text_content,
        created_at,
        profiles!inner (
          username,
          display_name,
          avatar_url
        ),
        events!moments_event_id_fkey (
          slug,
          title,
          image_url,
          starts_at,
          location_name
        )
      `)
      .in("id", momentIds)
      .eq("status", "published");

    if (momentsError) {
      console.error("[search] Failed to fetch moment details:", momentsError);
      return NextResponse.json(
        { error: "Failed to fetch results" },
        { status: 500 }
      );
    }

    // Transform and sort by similarity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchingMoments = (moments || []).map((m: any) => {
      const profile = m.profiles;
      const event = m.events;
      return {
        id: m.id,
        event_id: m.event_id,
        user_id: m.user_id,
        content_type: m.content_type,
        media_url: m.media_url,
        text_content: m.text_content,
        created_at: m.created_at,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        event_slug: event?.slug ?? "",
        event_title: event?.title ?? "",
        event_image_url: event?.image_url ?? null,
        event_starts_at: event?.starts_at ?? "",
        event_location_name: event?.location_name ?? null,
        similarity: similarityMap.get(m.id) || 0,
      };
    }).sort((a, b) => (b.similarity as number) - (a.similarity as number));

    return NextResponse.json({
      query,
      results: matchingMoments,
      count: matchingMoments.length,
    });
  } catch (error) {
    console.error("[search] Search error:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
