import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey);
}

export async function DELETE() {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "No service client" }, { status: 500 });
  }

  // Count before
  const { count: beforeCount } = await supabase
    .from("moment_embeddings")
    .select("*", { count: "exact", head: true });

  // Delete all embeddings
  const { error } = await supabase
    .from("moment_embeddings")
    .delete()
    .neq("moment_id", "00000000-0000-0000-0000-000000000000"); // Delete all (neq dummy uuid)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    message: "Embeddings truncated",
    deleted: beforeCount,
  });
}
