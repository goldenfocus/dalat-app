import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/loyalty/award
 * Award points to a user (admin-only).
 * Body: { userId, activityType, points?, referenceId?, referenceType? }
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

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "superadmin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, activityType, points, referenceId, referenceType } = body;

    if (!userId || !activityType) {
      return NextResponse.json(
        { error: "Missing required fields: userId and activityType" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("award_loyalty_points", {
      p_user_id: userId,
      p_activity_type: activityType,
      p_points: points ?? null,
      p_reference_id: referenceId ?? null,
      p_reference_type: referenceType ?? null,
    });

    if (error) {
      console.error("[api/loyalty/award] RPC error:", error);
      return NextResponse.json(
        { error: "Failed to award points" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("[api/loyalty/award] Error:", error);
    return NextResponse.json(
      { error: "Failed to award points" },
      { status: 500 }
    );
  }
}
