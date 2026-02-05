import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/karaoke/timing
 *
 * Save timing offset for a track (admin only).
 * Body: { trackId: string, timingOffset: number }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Parse body
    const body = await request.json();
    const { trackId, timingOffset } = body;

    if (!trackId || typeof timingOffset !== "number") {
      return NextResponse.json(
        { error: "Missing trackId or timingOffset" },
        { status: 400 }
      );
    }

    // Call RPC to update timing (handles admin check)
    const { data, error } = await supabase.rpc("update_track_timing_offset", {
      p_track_id: trackId,
      p_timing_offset: timingOffset,
    });

    if (error) {
      console.error("Error updating timing:", error);

      if (error.message.includes("Admin access required")) {
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: "Failed to save timing" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, timingOffset });
  } catch (error) {
    console.error("Timing API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
