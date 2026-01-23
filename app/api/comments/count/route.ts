import { NextRequest, NextResponse } from "next/server";
import { getCommentCount } from "@/lib/comments";
import type { CommentTargetType } from "@/lib/types";

/**
 * GET /api/comments/count
 * Get comment count for a target
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetType = searchParams.get("targetType") as CommentTargetType;
  const targetId = searchParams.get("targetId");

  if (!targetType || !targetId) {
    return NextResponse.json(
      { error: "Missing targetType or targetId" },
      { status: 400 }
    );
  }

  if (!["event", "moment"].includes(targetType)) {
    return NextResponse.json(
      { error: "Invalid targetType" },
      { status: 400 }
    );
  }

  try {
    const counts = await getCommentCount(targetType, targetId);
    return NextResponse.json(counts || { total_count: 0, top_level_count: 0 });
  } catch (error) {
    console.error("[api/comments/count] Error fetching count:", error);
    return NextResponse.json(
      { error: "Failed to fetch count" },
      { status: 500 }
    );
  }
}
