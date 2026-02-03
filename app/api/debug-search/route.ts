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

// Debug: log key info (prefix only, not full key)
function getKeyDebugInfo() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    prefix: key.substring(0, 10),
    length: key.length,
    hasWhitespace: /\s/.test(key),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "dog";

  try {
    const supabase = createServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: "No service client" }, { status: 500 });
    }

    // Get a stored embedding
    const { data: stored, error: storedError } = await supabase
      .from("moment_embeddings")
      .select("moment_id, embedding")
      .limit(1)
      .single();

    if (storedError) {
      return NextResponse.json({ error: storedError.message }, { status: 500 });
    }

    // Parse stored embedding
    const storedVec = typeof stored.embedding === "string"
      ? JSON.parse(stored.embedding)
      : stored.embedding;

    // Generate query embedding
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });
    const rawOutput = await replicate.run(CLIP_MODEL, {
      input: { text: query },
    });

    let queryVec: number[];
    if (rawOutput && typeof rawOutput === "object" && !Array.isArray(rawOutput) && (rawOutput as any).embedding) {
      // krthr/clip-embeddings returns {embedding: [...]}
      queryVec = (rawOutput as any).embedding;
    } else if (Array.isArray(rawOutput) && rawOutput.length > 0 && (rawOutput[0] as any)?.embedding) {
      queryVec = (rawOutput[0] as any).embedding;
    } else if (Array.isArray(rawOutput) && rawOutput.length === 768) {
      queryVec = rawOutput as number[];
    } else {
      return NextResponse.json({ error: "Unexpected format", rawOutput }, { status: 500 });
    }

    // Calculate cosine similarity manually
    const dotProduct = storedVec.reduce((sum: number, a: number, i: number) => sum + a * queryVec[i], 0);
    const normA = Math.sqrt(storedVec.reduce((sum: number, a: number) => sum + a * a, 0));
    const normB = Math.sqrt(queryVec.reduce((sum: number, a: number) => sum + a * a, 0));
    const cosineSim = dotProduct / (normA * normB);

    // Test RPC call
    const queryEmbeddingString = `[${queryVec.join(",")}]`;
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "search_moments_by_embedding",
      {
        query_embedding: queryEmbeddingString,
        match_threshold: 0.0,
        match_count: 3,
      }
    );

    // New detailed debug function
    const { data: debugResult, error: debugError } = await supabase.rpc(
      "debug_search_test",
      {
        query_embedding: queryEmbeddingString,
        match_threshold: 0.0,
      }
    );

    // Check if embeddings have matching moments (no vector ops)
    const { data: embeddingMoments, error: embeddingMomentsError } = await supabase.rpc(
      "debug_embedding_moments"
    );

    // KEY TEST: Use stored embedding (not text embedding) via RPC
    // This tells us if RPC works at all vs text embedding specific issue
    const storedEmbeddingStr = typeof stored.embedding === "string"
      ? stored.embedding
      : `[${stored.embedding.join(",")}]`;

    const { data: storedEmbRpcResult, error: storedEmbRpcError } = await supabase.rpc(
      "debug_search_test",
      {
        query_embedding: storedEmbeddingStr,
        match_threshold: 0.0,
      }
    );

    // Debug: compare embedding string formats
    const hasNaN = queryVec.some(v => isNaN(v));
    const hasInf = queryVec.some(v => !isFinite(v));
    const minVal = Math.min(...queryVec);
    const maxVal = Math.max(...queryVec);

    const stringDebug = {
      storedStr: {
        length: storedEmbeddingStr.length,
        first50: storedEmbeddingStr.substring(0, 50),
        last50: storedEmbeddingStr.substring(storedEmbeddingStr.length - 50),
      },
      queryStr: {
        length: queryEmbeddingString.length,
        first50: queryEmbeddingString.substring(0, 50),
        last50: queryEmbeddingString.substring(queryEmbeddingString.length - 50),
      },
      queryValidation: {
        hasNaN,
        hasInf,
        minVal,
        maxVal,
      }
    };

    // Test: Call debug_search_test with EXACT same format as stored (JSON.stringify then parse)
    const queryVecNormalized = queryVec.map(v => parseFloat(v.toFixed(8)));
    const queryEmbeddingNormalized = `[${queryVecNormalized.join(",")}]`;

    // Ultimate test: Use the EXACT stored embedding as-is (should return similarity 1)
    // This tests if the Supabase client parameter passing is working
    const { data: directQueryResult, error: directQueryError } = await supabase.rpc(
      "debug_search_test",
      {
        query_embedding: storedEmbeddingStr,  // Same string as storedEmbRpcTest
        match_threshold: 0.0,
      }
    );

    // Test with JSON.stringify to see if Supabase needs a different format
    const { data: jsonResult, error: jsonError } = await supabase.rpc(
      "debug_search_test",
      {
        query_embedding: JSON.stringify(queryVec),  // Try JSON format
        match_threshold: 0.0,
      }
    );

    // ULTIMATE TEST: Format query embedding EXACTLY like stored embedding
    // Parse stored embedding to get array, then reformat using same precision
    const storedFirst = storedVec[0]; // e.g., -0.22960874 (8 decimal places)
    const queryFirst = queryVec[0];   // e.g., 0.14570604264736176 (17 decimal places)

    // Round query to 8 decimal places like stored
    const queryRoundedToStored = queryVec.map(v => Math.round(v * 100000000) / 100000000);
    const queryRoundedString = `[${queryRoundedToStored.join(",")}]`;

    const { data: roundedResult, error: roundedError } = await supabase.rpc(
      "debug_search_test",
      {
        query_embedding: queryRoundedString,
        match_threshold: 0.0,
      }
    );

    // BYPASS SUPABASE JS CLIENT - use direct REST API
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const directRestResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/debug_search_test`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query_embedding: queryRoundedString,
        match_threshold: 0.0,
      }),
    });

    const directRestResult = await directRestResponse.json();

    // ULTIMATE TEST: Use the EXACT stored embedding string but call it "text query"
    // This isolates whether it's the STRING VALUES or the CALL CONTEXT
    const { data: storedAsQueryResult, error: storedAsQueryError } = await supabase.rpc(
      "debug_search_test",
      {
        query_embedding: storedEmbeddingStr,  // Using stored embedding as the query
        match_threshold: 0.0,
      }
    );

    // Test: Use query embedding against search_moments_by_embedding (should fail given threshold)
    // But first test with a 0.0 threshold to see if anything is returned
    const { data: queryVsStoredEmb, error: queryVsStoredError } = await supabase.rpc(
      "search_moments_by_embedding",
      {
        query_embedding: storedEmbeddingStr,  // Use STORED embedding (should work)
        match_threshold: 0.0,
        match_count: 3,
      }
    );

    // Test: What if we use stored embedding format with commas intact
    // The stored string might have trailing zeros stripped differently
    const formatDebug = {
      storedSample: storedVec.slice(0, 3).map(String),
      querySample: queryVec.slice(0, 3).map(String),
      roundedSample: queryRoundedToStored.slice(0, 3).map(String),
      roundedStringLen: queryRoundedString.length,
    };

    const { data: normalizedResult, error: normalizedError } = await supabase.rpc(
      "debug_search_test",
      {
        query_embedding: queryEmbeddingNormalized,
        match_threshold: 0.0,
      }
    );

    return NextResponse.json({
      query,
      storedEmbedding: {
        moment_id: stored.moment_id,
        length: storedVec.length,
        first5: storedVec.slice(0, 5),
        norm: normA.toFixed(4),
      },
      queryEmbedding: {
        length: queryVec.length,
        first5: queryVec.slice(0, 5),
        norm: normB.toFixed(4),
      },
      manualCosineSimilarity: cosineSim.toFixed(4),
      rpcResult: rpcError ? { error: rpcError.message } : rpcResult?.slice(0, 3),
      debugSearchTest: debugError ? { error: debugError.message } : debugResult,
      embeddingMoments: embeddingMomentsError ? { error: embeddingMomentsError.message } : embeddingMoments,
      storedEmbRpcTest: storedEmbRpcError ? { error: storedEmbRpcError.message } : storedEmbRpcResult?.slice(0, 3),
      normalizedTest: normalizedError ? { error: normalizedError.message } : normalizedResult?.slice(0, 3),
      directQueryResult: directQueryError ? { error: directQueryError.message } : directQueryResult?.slice(0, 1),
      jsonFormatResult: jsonError ? { error: jsonError.message } : jsonResult?.slice(0, 1),
      roundedResult: roundedError ? { error: roundedError.message } : roundedResult?.slice(0, 3),
      directRestResult: Array.isArray(directRestResult) ? directRestResult.slice(0, 3) : directRestResult,
      storedAsQueryResult: storedAsQueryError ? { error: storedAsQueryError.message } : storedAsQueryResult?.slice(0, 1),
      queryVsStoredEmb: queryVsStoredError ? { error: queryVsStoredError.message } : queryVsStoredEmb?.slice(0, 3),
      formatDebug,
      stringDebug,
      keyDebugInfo: getKeyDebugInfo(),
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Unknown error"
    }, { status: 500 });
  }
}
