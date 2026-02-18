import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/loyalty/host-rewards
 * Returns current user's host rewards — perks active/locked based on tier.
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

    // Get user's loyalty status to determine tier
    const { data: loyaltyStatus, error: statusError } = await supabase
      .from("user_loyalty")
      .select("current_tier, total_lifetime_points")
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
    const totalPoints = loyaltyStatus?.total_lifetime_points || 0;

    // Get user's claimed rewards
    const { data: claimedRewards, error: claimedError } = await supabase
      .from("user_rewards")
      .select(
        `
        id,
        claimed_at,
        is_active,
        expires_at,
        used_at,
        reward:loyalty_rewards (
          id,
          slug,
          title,
          description,
          reward_type,
          required_tier,
          icon_emoji,
          icon_url,
          badge_color,
          feature_key
        )
      `
      )
      .eq("user_id", user.id)
      .order("claimed_at", { ascending: false });

    if (claimedError) {
      console.error("[api/loyalty/host-rewards] Claimed rewards error:", claimedError);
      return NextResponse.json(
        { error: "Failed to fetch host rewards" },
        { status: 500 }
      );
    }

    // Get all available rewards to show locked/unlocked status
    const { data: allRewards, error: rewardsError } = await supabase
      .from("loyalty_rewards")
      .select(
        "id, slug, title, description, reward_type, required_tier, required_points, icon_emoji, icon_url, badge_color, feature_key, status"
      )
      .in("status", ["active", "seasonal"])
      .in("reward_type", ["feature", "profile_badge", "custom_perk"]);

    if (rewardsError) {
      console.error("[api/loyalty/host-rewards] All rewards error:", rewardsError);
      return NextResponse.json(
        { error: "Failed to fetch rewards catalog" },
        { status: 500 }
      );
    }

    // Tier hierarchy for comparison
    const tierRank: Record<string, number> = {
      explorer: 0,
      regular: 1,
      local: 1,
      insider: 2,
      ambassador: 3,
      legend: 4,
    };

    const userTierRank = tierRank[currentTier] ?? 0;

    // Build host rewards with locked/unlocked status
    const hostRewards = (allRewards || []).map((reward) => {
      const requiredRank = reward.required_tier
        ? (tierRank[reward.required_tier] ?? 0)
        : 0;
      const meetsPointReq =
        !reward.required_points || totalPoints >= reward.required_points;
      const meetsTierReq = userTierRank >= requiredRank;
      const isUnlocked = meetsTierReq && meetsPointReq;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const claimed = (claimedRewards || []).find((cr: any) => {
        // Supabase join returns reward as object or array depending on relationship
        const rewardData = Array.isArray(cr.reward) ? cr.reward[0] : cr.reward;
        return rewardData && rewardData.id === reward.id;
      });

      return {
        ...reward,
        is_unlocked: isUnlocked,
        is_claimed: !!claimed,
        claimed_at: claimed?.claimed_at || null,
        is_active: claimed?.is_active ?? false,
      };
    });

    return NextResponse.json({
      data: {
        currentTier,
        totalPoints,
        rewards: hostRewards,
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
