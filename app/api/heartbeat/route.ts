import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Heartbeat endpoint for tracking user activity.
 * Called periodically by the client to update last_action_at.
 * Server-side throttling: only writes to DB if last action was >5 minutes ago.
 */
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("record_user_activity");

  if (error) {
    console.error("Heartbeat error:", error);
    return NextResponse.json(
      { error: "Failed to record activity" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
