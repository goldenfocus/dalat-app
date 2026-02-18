import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/loyalty/leaderboard
 * Returns leaderboard data. Public endpoint (no auth required).
 * Query params: limit (default 50), offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "50", 10),
      100
    );
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const supabase = await createClient();

    // Get leaderboard via direct query with foreign key join to profiles
    const { data: leaderboard, error } = await supabase
      .from("user_loyalty_status")
      .select(
        "user_id, current_tier, current_point_balance, total_points_earned, profiles!inner(username, display_name, avatar_url)"
      )
      .gt("current_point_balance", 0)
      .order("current_point_balance", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[api/loyalty/leaderboard] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch leaderboard" },
        { status: 500 }
      );
    }

    // Transform: add rank numbers and flatten the profiles join
    const ranked = (leaderboard || []).map((entry: any, index: number) => ({
      rank: offset + index + 1,
      user_id: entry.user_id,
      username: entry.profiles.username,
      display_name: entry.profiles.display_name || entry.profiles.username,
      avatar_url: entry.profiles.avatar_url,
      current_tier: entry.current_tier,
      points: entry.current_point_balance,
    }));

    // Optionally get the current user's rank if they're authenticated
    let currentUserRank = null;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // Get user's point balance first
      const { data: userStatus } = await supabase
        .from("user_loyalty_status")
        .select("current_point_balance")
        .eq("user_id", user.id)
        .single();

      if (userStatus) {
        // Count users with more points to determine rank
        const { count } = await supabase
          .from("user_loyalty_status")
          .select("user_id", { count: "exact", head: true })
          .gt("current_point_balance", userStatus.current_point_balance);

        currentUserRank = {
          rank: (count ?? 0) + 1,
          points: userStatus.current_point_balance,
        };
      }
    }

    return NextResponse.json({
      data: {
        leaderboard: ranked,
        currentUserRank,
        type: "lifetime",
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error("[api/loyalty/leaderboard] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
