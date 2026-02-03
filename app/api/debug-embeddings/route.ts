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

export async function GET() {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "No service client" }, { status: 500 });
  }

  // Get first 3 embeddings
  const { data: embeddings, error } = await supabase
    .from("moment_embeddings")
    .select("moment_id, embedding")
    .limit(3);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Check if embeddings are all the same
  const samples = (embeddings || []).map((e, i) => {
    const vec = typeof e.embedding === "string"
      ? JSON.parse(e.embedding)
      : e.embedding;
    return {
      index: i,
      moment_id: e.moment_id,
      length: Array.isArray(vec) ? vec.length : "not array",
      first5: Array.isArray(vec) ? vec.slice(0, 5) : vec,
      sum: Array.isArray(vec) ? vec.reduce((a: number, b: number) => a + b, 0).toFixed(4) : "N/A",
    };
  });

  // Check if all embeddings are identical
  const allSame = samples.length > 1 && samples.every(
    (s, _, arr) => JSON.stringify(s.first5) === JSON.stringify(arr[0].first5)
  );

  // Test: Try to search using one of the stored embeddings (should match itself with similarity=1)
  let selfSearchResult = null;
  if (embeddings && embeddings.length > 0) {
    const firstEmbedding = embeddings[0].embedding;
    const embeddingString = typeof firstEmbedding === "string"
      ? firstEmbedding
      : `[${firstEmbedding.join(",")}]`;

    // Test 1: Direct RPC call
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "search_moments_by_embedding",
      {
        query_embedding: embeddingString,
        match_threshold: 0.0,
        match_count: 5,
      }
    );

    // Test 2: Raw SQL query to verify function exists
    const { data: fnCheck, error: fnError } = await supabase
      .from("moment_embeddings")
      .select("moment_id")
      .limit(1);

    // Test 3: Check if moments have published status
    const { data: momentStatus, error: statusError } = await supabase
      .from("moments")
      .select("id, status")
      .in("id", embeddings.map((e) => e.moment_id));

    // Test 4: Direct vector similarity query (bypassing RPC)
    const { data: directQuery, error: directError } = await supabase
      .from("moment_embeddings")
      .select("moment_id")
      .limit(5);

    selfSearchResult = {
      testedMomentId: embeddings[0].moment_id,
      embeddingPreview: embeddingString.substring(0, 100) + "...",
      rpcResult: rpcError ? { error: rpcError.message, code: rpcError.code, hint: rpcError.hint } : rpcData,
      tableCheck: fnError ? { error: fnError.message } : { count: fnCheck?.length },
      momentStatuses: statusError ? { error: statusError.message } : momentStatus,
      directQueryCount: directError ? { error: directError.message } : directQuery?.length,
    };
  }

  // Test 5: Generate text embedding and search
  let textSearchTest = null;
  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (replicateToken) {
    try {
      const replicate = new Replicate({ auth: replicateToken });
      const textQuery = "people";

      const rawOutput = await replicate.run(CLIP_MODEL, {
        input: { text: textQuery },
      });

      // Parse response
      let textEmbedding: number[] | null = null;
      if (rawOutput && typeof rawOutput === "object" && !Array.isArray(rawOutput) && (rawOutput as { embedding?: number[] }).embedding) {
        textEmbedding = (rawOutput as { embedding: number[] }).embedding;
      }

      if (textEmbedding && textEmbedding.length === 768) {
        // Test both full precision and truncated precision
        const textEmbeddingString = `[${textEmbedding.join(",")}]`;
        const truncatedEmbeddingString = `[${textEmbedding.map(v => v.toFixed(8)).join(",")}]`;

        // Try RPC with text embedding (full precision)
        const { data: textRpcData, error: textRpcError } = await supabase.rpc(
          "search_moments_by_embedding",
          {
            query_embedding: textEmbeddingString,
            match_threshold: 0.0,
            match_count: 5,
          }
        );

        // Try RPC with truncated precision (matches stored format)
        const { data: truncatedRpcData, error: truncatedRpcError } = await supabase.rpc(
          "search_moments_by_embedding",
          {
            query_embedding: truncatedEmbeddingString,
            match_threshold: 0.0,
            match_count: 5,
          }
        );

        // Manual cosine similarity with first stored embedding
        if (embeddings && embeddings.length > 0) {
          const storedVec = typeof embeddings[0].embedding === "string"
            ? JSON.parse(embeddings[0].embedding)
            : embeddings[0].embedding;

          const dotProduct = storedVec.reduce((sum: number, a: number, i: number) => sum + a * textEmbedding![i], 0);
          const normA = Math.sqrt(storedVec.reduce((sum: number, a: number) => sum + a * a, 0));
          const normB = Math.sqrt(textEmbedding.reduce((sum: number, a: number) => sum + a * a, 0));
          const cosineSim = dotProduct / (normA * normB);

          // Compare string formats
        const storedEmbString = typeof embeddings[0].embedding === "string"
          ? embeddings[0].embedding
          : `[${embeddings[0].embedding.join(",")}]`;

        textSearchTest = {
            query: textQuery,
            embeddingLength: textEmbedding.length,
            first5: textEmbedding.slice(0, 5),
            norm: normB.toFixed(4),
            manualCosineSim: cosineSim.toFixed(4),
            rpcResultFullPrecision: textRpcError ? { error: textRpcError.message } : textRpcData,
            rpcResultTruncated: truncatedRpcError ? { error: truncatedRpcError.message } : truncatedRpcData,
            debugFormats: {
              storedType: typeof embeddings[0].embedding,
              storedPrefix: storedEmbString.substring(0, 80),
              textFullPrefix: textEmbeddingString.substring(0, 80),
              textTruncatedPrefix: truncatedEmbeddingString.substring(0, 80),
            }
          };
        }
      } else {
        textSearchTest = { error: "Failed to generate text embedding", rawOutput: JSON.stringify(rawOutput).slice(0, 200) };
      }
    } catch (err) {
      textSearchTest = { error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  return NextResponse.json({
    count: embeddings?.length || 0,
    allSameFirst5: allSame,
    samples,
    selfSearchTest: selfSearchResult,
    textSearchTest,
  });
}
