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

  return NextResponse.json({
    count: embeddings?.length || 0,
    allSameFirst5: allSame,
    samples,
  });
}
