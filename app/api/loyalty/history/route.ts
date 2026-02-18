import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/loyalty/history
 * Returns the user's point transaction history.
 * Query params: limit (default 20), offset (default 0)
 * Requires authentication.
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
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "20", 10),
      100
    );
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Query loyalty_point_transactions table (from the loyalty migration)
    const { data: transactions, error, count } = await supabase
      .from("loyalty_point_transactions")
      .select("id, activity_type, points_delta, reference_type, reference_id, admin_note, created_at", {
        count: "exact",
      })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[api/loyalty/history] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch history" },
        { status: 500 }
      );
    }

    const hasMore = (count ?? 0) > offset + limit;

    return NextResponse.json({
      data: {
        transactions: transactions || [],
        total: count ?? 0,
        hasMore,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error("[api/loyalty/history] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
