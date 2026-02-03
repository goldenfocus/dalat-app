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
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Unknown error"
    }, { status: 500 });
  }
}
