import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/loyalty/status
 * Returns the current user's loyalty status by calling get_my_loyalty_summary() RPC.
 * Requires authentication.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("get_my_loyalty_summary");

    if (error) {
      console.error("[api/loyalty/status] RPC error:", error);
      return NextResponse.json(
        { error: "Failed to fetch loyalty status" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("[api/loyalty/status] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch loyalty status" },
      { status: 500 }
    );
  }
}
