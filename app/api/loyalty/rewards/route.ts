import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/loyalty/rewards
 * Returns available rewards catalog with personalized eligibility.
 * Requires authentication to show eligibility info.
 * Query params: category (optional filter)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    // Use the RPC that includes eligibility checks
    const { data: rewards, error } = await supabase.rpc(
      "get_available_rewards",
      {
        p_user_id: user.id,
      }
    );

    if (error) {
      console.error("[api/loyalty/rewards] RPC error:", error);
      return NextResponse.json(
        { error: "Failed to fetch rewards" },
        { status: 500 }
      );
    }

    // Filter by category if provided
    let filteredRewards = rewards || [];
    if (category) {
      filteredRewards = filteredRewards.filter(
        (r: { reward_type: string }) => r.reward_type === category
      );
    }

    return NextResponse.json({ data: filteredRewards });
  } catch (error) {
    console.error("[api/loyalty/rewards] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch rewards" },
      { status: 500 }
    );
  }
}
