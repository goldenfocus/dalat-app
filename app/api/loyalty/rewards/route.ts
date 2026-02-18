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

    // Query the rewards table directly (no RPC needed)
    let query = supabase
      .from("rewards")
      .select("id, name, description, category, points_cost, tier_required, is_active, stock_remaining, image_url, max_redemptions_per_user")
      .eq("is_active", true);

    if (category) {
      query = query.eq("category", category);
    }

    const { data: rewards, error } = await query.order("points_cost", { ascending: true });

    if (error) {
      console.error("[api/loyalty/rewards] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch rewards" },
        { status: 500 }
      );
    }

    // Get user's status for eligibility
    const { data: userStatus } = await supabase
      .from("user_loyalty_status")
      .select("current_tier, current_point_balance")
      .eq("user_id", user.id)
      .single();

    const tierRank: Record<string, number> = {
      explorer: 0,
      local: 1,
      insider: 2,
      legend: 3,
    };

    const userTierRank = tierRank[userStatus?.current_tier ?? "explorer"] ?? 0;
    const userPoints = userStatus?.current_point_balance ?? 0;

    // Add eligibility info to each reward
    const enrichedRewards = (rewards || []).map((r) => {
      const requiredTierRank = r.tier_required ? (tierRank[r.tier_required] ?? 0) : 0;
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        points_cost: r.points_cost,
        tier_required: r.tier_required,
        is_active: r.is_active,
        stock_remaining: r.stock_remaining,
        image_url: r.image_url,
        can_afford: userPoints >= r.points_cost,
        meets_tier: userTierRank >= requiredTierRank,
        eligible: userPoints >= r.points_cost && userTierRank >= requiredTierRank,
      };
    });

    return NextResponse.json({ data: enrichedRewards });
  } catch (error) {
    console.error("[api/loyalty/rewards] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch rewards" },
      { status: 500 }
    );
  }
}
