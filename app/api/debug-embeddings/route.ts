import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

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

  return NextResponse.json({
    count: embeddings?.length || 0,
    allSameFirst5: allSame,
    samples,
    selfSearchTest: selfSearchResult,
  });
}
