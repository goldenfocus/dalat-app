import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/loyalty/claim
 * Claim/redeem a reward.
 * Body: { rewardId: string }
 * Requires authentication.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { rewardId } = body;

    if (!rewardId) {
      return NextResponse.json(
        { error: "Missing rewardId" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("redeem_loyalty_reward", {
      p_reward_id: rewardId,
    });

    if (error) {
      // Map known RPC exceptions to user-friendly messages
      const errorMessage = error.message || "Failed to claim reward";
      const errorMap: Record<string, { message: string; status: number }> = {
        not_authenticated: { message: "Not authenticated", status: 401 },
        reward_not_available: {
          message: "This reward is no longer available",
          status: 400,
        },
        user_not_enrolled: {
          message: "You are not enrolled in the loyalty program",
          status: 400,
        },
        insufficient_points: {
          message: "You don't have enough points for this reward",
          status: 400,
        },
        tier_requirement_not_met: {
          message: "Your tier is not high enough for this reward",
          status: 400,
        },
        reward_out_of_stock: {
          message: "This reward is out of stock",
          status: 400,
        },
        max_redemptions_reached: {
          message: "You have already redeemed this reward the maximum number of times",
          status: 400,
        },
      };

      for (const [key, value] of Object.entries(errorMap)) {
        if (errorMessage.includes(key)) {
          return NextResponse.json(
            { error: value.message },
            { status: value.status }
          );
        }
      }

      console.error("[api/loyalty/claim] RPC error:", error);
      return NextResponse.json(
        { error: "Failed to claim reward" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("[api/loyalty/claim] Error:", error);
    return NextResponse.json(
      { error: "Failed to claim reward" },
      { status: 500 }
    );
  }
}
