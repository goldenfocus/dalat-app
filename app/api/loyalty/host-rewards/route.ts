import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/loyalty/host-rewards
 * Returns current user's host rewards using the get_host_rewards RPC.
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

    // Get user's loyalty status
    const { data: loyaltyStatus, error: statusError } = await supabase
      .from("user_loyalty_status")
      .select("current_tier, current_point_balance, total_points_earned")
      .eq("user_id", user.id)
      .single();

    if (statusError && statusError.code !== "PGRST116") {
      console.error("[api/loyalty/host-rewards] Status error:", statusError);
      return NextResponse.json(
        { error: "Failed to fetch loyalty status" },
        { status: 500 }
      );
    }

    const currentTier = loyaltyStatus?.current_tier || "explorer";
    const totalPoints = loyaltyStatus?.total_points_earned || 0;

    // Get host rewards via the existing RPC
    const { data: hostRewards, error: rewardsError } = await supabase.rpc(
      "get_host_rewards",
      { p_user_id: user.id }
    );

    if (rewardsError) {
      console.error("[api/loyalty/host-rewards] RPC error:", rewardsError);
      return NextResponse.json(
        { error: "Failed to fetch host rewards" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        currentTier,
        totalPoints,
        rewards: hostRewards ?? [],
      },
    });
  } catch (error) {
    console.error("[api/loyalty/host-rewards] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch host rewards" },
      { status: 500 }
    );
  }
}
