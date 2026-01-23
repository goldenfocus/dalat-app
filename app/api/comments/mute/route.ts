import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toggleMuteThread } from "@/lib/comments";

/**
 * POST /api/comments/mute
 * Toggle mute on a thread
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
    const { threadId } = body;

    if (!threadId) {
      return NextResponse.json(
        { error: "Missing threadId" },
        { status: 400 }
      );
    }

    const result = await toggleMuteThread(threadId);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to toggle mute" },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/comments/mute] Error toggling mute:", error);
    return NextResponse.json(
      { error: "Failed to toggle mute" },
      { status: 500 }
    );
  }
}
