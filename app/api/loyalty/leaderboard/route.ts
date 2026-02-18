import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/loyalty/leaderboard
 * Returns leaderboard data. Public endpoint (no auth required).
 * Query params: limit (default 50), offset (default 0), type (default 'lifetime')
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "50", 10),
      100
    );
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const type = searchParams.get("type") || "lifetime";

    if (!["lifetime", "cycle"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid leaderboard type. Must be 'lifetime' or 'cycle'." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get leaderboard via RPC
    const { data: leaderboard, error } = await supabase.rpc(
      "get_loyalty_leaderboard",
      {
        p_limit: limit,
        p_offset: offset,
        p_leaderboard_type: type,
      }
    );

    if (error) {
      console.error("[api/loyalty/leaderboard] RPC error:", error);
      return NextResponse.json(
        { error: "Failed to fetch leaderboard" },
        { status: 500 }
      );
    }

    // Optionally get the current user's rank if they're authenticated
    let currentUserRank = null;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: rankData, error: rankError } = await supabase.rpc(
        "get_user_leaderboard_rank",
        {
          p_user_id: user.id,
          p_leaderboard_type: type,
        }
      );

      if (!rankError && rankData) {
        currentUserRank = rankData;
      }
    }

    return NextResponse.json({
      data: {
        leaderboard: leaderboard || [],
        currentUserRank,
        type,
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
