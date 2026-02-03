import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/moments/check-duplicates
 * Check which file hashes already exist in an event/album
 *
 * Request body:
 * - eventId: string - The event to check against
 * - hashes: string[] - Array of SHA-256 file hashes to check
 *
 * Response:
 * - duplicates: string[] - Hashes that already exist in the album
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { eventId, hashes } = body;

    if (!eventId || !Array.isArray(hashes)) {
      return NextResponse.json(
        { error: "Missing eventId or hashes array" },
        { status: 400 }
      );
    }

    if (hashes.length === 0) {
      return NextResponse.json({ duplicates: [] });
    }

    // Limit to prevent abuse
    if (hashes.length > 500) {
      return NextResponse.json(
        { error: "Too many hashes (max 500)" },
        { status: 400 }
      );
    }

    // Call the RPC function to check for duplicates
    const { data, error } = await supabase.rpc("check_duplicate_hashes", {
      p_event_id: eventId,
      p_hashes: hashes,
    });

    if (error) {
      console.error("[check-duplicates] RPC error:", error);
      return NextResponse.json(
        { error: "Failed to check duplicates" },
        { status: 500 }
      );
    }

    return NextResponse.json({ duplicates: data || [] });
  } catch (error) {
    console.error("[check-duplicates] Error:", error);
    return NextResponse.json(
      { error: "Failed to check duplicates" },
      { status: 500 }
    );
  }
}
