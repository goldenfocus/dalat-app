import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Replicate from "replicate";

export const dynamic = "force-dynamic";

const CLIP_MODEL = "krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "dog";

  try {
    const supabase = createServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: "No service client" }, { status: 500 });
    }

    // Get a stored embedding - check what type it returns
    const { data: stored, error: storedError } = await supabase
      .from("moment_embeddings")
      .select("moment_id, embedding")
      .limit(1)
      .single();

    if (storedError) {
      return NextResponse.json({ error: storedError.message }, { status: 500 });
    }

    // Check the raw type returned by Supabase
    const storedEmbeddingRawType = typeof stored.embedding;
    const storedEmbeddingIsArray = Array.isArray(stored.embedding);

    // Parse stored embedding to array
    const storedVec: number[] = typeof stored.embedding === "string"
      ? JSON.parse(stored.embedding)
      : stored.embedding;

    // Generate query embedding
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });
    const rawOutput = await replicate.run(CLIP_MODEL, {
      input: { text: query },
    });

    let queryVec: number[];
    if (rawOutput && typeof rawOutput === "object" && !Array.isArray(rawOutput) && (rawOutput as any).embedding) {
      queryVec = (rawOutput as any).embedding;
    } else if (Array.isArray(rawOutput) && rawOutput.length > 0 && (rawOutput[0] as any)?.embedding) {
      queryVec = (rawOutput[0] as any).embedding;
    } else if (Array.isArray(rawOutput) && rawOutput.length === 768) {
      queryVec = rawOutput as number[];
    } else {
      return NextResponse.json({ error: "Unexpected format", rawOutput }, { status: 500 });
    }

    // Manual JS cosine similarity (this works)
    const dotProduct = storedVec.reduce((sum: number, a: number, i: number) => sum + a * queryVec[i], 0);
    const normA = Math.sqrt(storedVec.reduce((sum: number, a: number) => sum + a * a, 0));
    const normB = Math.sqrt(queryVec.reduce((sum: number, a: number) => sum + a * a, 0));
    const manualCosineSim = dotProduct / (normA * normB);

    // Create embedding strings using the SAME method for both
    // This tests if the format is the issue vs the values
    const storedEmbStr_jsFormat = `[${storedVec.join(",")}]`;
    const queryEmbStr_jsFormat = `[${queryVec.join(",")}]`;

    // Also get the raw database string if available
    const storedEmbStr_dbFormat = typeof stored.embedding === "string"
      ? stored.embedding
      : null;

    // TEST 1: Search with stored embedding using JS-formatted string
    const { data: test1_result, error: test1_error } = await supabase.rpc(
      "debug_search_test",
      { query_embedding: storedEmbStr_jsFormat, match_threshold: 0.0 }
    );

    // TEST 2: Search with stored embedding using DB-formatted string (if available)
    let test2_result = null, test2_error = null;
    if (storedEmbStr_dbFormat) {
      const result = await supabase.rpc(
        "debug_search_test",
        { query_embedding: storedEmbStr_dbFormat, match_threshold: 0.0 }
      );
      test2_result = result.data;
      test2_error = result.error;
    }

    // TEST 3: Search with query (text) embedding using JS-formatted string
    const { data: test3_result, error: test3_error } = await supabase.rpc(
      "debug_search_test",
      { query_embedding: queryEmbStr_jsFormat, match_threshold: 0.0 }
    );

    // TEST 4: Use search_moments_by_embedding with different formats
    const { data: searchWithStored, error: searchWithStoredErr } = await supabase.rpc(
      "search_moments_by_embedding",
      { query_embedding: storedEmbStr_jsFormat, match_threshold: 0.0, match_count: 3 }
    );

    const { data: searchWithQuery, error: searchWithQueryErr } = await supabase.rpc(
      "search_moments_by_embedding",
      { query_embedding: queryEmbStr_jsFormat, match_threshold: 0.0, match_count: 3 }
    );

    // Compare string formats
    const formatComparison = {
      storedVecLength: storedVec.length,
      queryVecLength: queryVec.length,
      jsFormatted: {
        storedStrLength: storedEmbStr_jsFormat.length,
        queryStrLength: queryEmbStr_jsFormat.length,
        storedFirst50: storedEmbStr_jsFormat.substring(0, 50),
        queryFirst50: queryEmbStr_jsFormat.substring(0, 50),
      },
      dbFormatted: storedEmbStr_dbFormat ? {
        dbStrLength: storedEmbStr_dbFormat.length,
        dbFirst50: storedEmbStr_dbFormat.substring(0, 50),
        jsVsDbMatch: storedEmbStr_jsFormat === storedEmbStr_dbFormat,
      } : null,
      storedEmbeddingRawType,
      storedEmbeddingIsArray,
    };

    return NextResponse.json({
      query,
      manualCosineSimilarity: manualCosineSim.toFixed(6),

      // Key insight: do JS-formatted strings work?
      tests: {
        // If this fails but test2 works, JS formatting is the issue
        test1_storedEmb_jsFormat: {
          resultCount: test1_error ? 0 : test1_result?.length || 0,
          error: test1_error?.message || null,
          firstResult: test1_result?.[0] || null,
        },
        // If this works but test1 fails, db format is different from JS format
        test2_storedEmb_dbFormat: storedEmbStr_dbFormat ? {
          resultCount: test2_error ? 0 : test2_result?.length || 0,
          error: test2_error?.message || null,
          firstResult: test2_result?.[0] || null,
        } : "N/A (embedding not returned as string)",
        // If test1 works but test3 fails, the issue is the query embedding VALUES, not format
        test3_queryEmb_jsFormat: {
          resultCount: test3_error ? 0 : test3_result?.length || 0,
          error: test3_error?.message || null,
          firstResult: test3_result?.[0] || null,
        },
      },

      // Actual search results
      searchResults: {
        withStoredEmb: searchWithStoredErr ? { error: searchWithStoredErr.message } : searchWithStored?.length || 0,
        withQueryEmb: searchWithQueryErr ? { error: searchWithQueryErr.message } : searchWithQuery?.length || 0,
      },

      formatComparison,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Unknown error"
    }, { status: 500 });
  }
}
