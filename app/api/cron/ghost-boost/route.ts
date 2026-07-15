import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[ghost-boost] CRON_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Kill switch: everything ghost-related is inert unless explicitly enabled.
  if (process.env.GHOST_BOOST_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: "GHOST_BOOST_ENABLED is not true" });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("ghost_boost_tick");

    if (error) {
      console.error("[ghost-boost] RPC error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log("[ghost-boost] Result:", data);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[ghost-boost] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
