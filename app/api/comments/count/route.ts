import { NextRequest, NextResponse } from "next/server";
import { getCommentCount, getMomentCommentCounts } from "@/lib/comments";
import type { CommentTargetType } from "@/lib/types";

/**
 * GET /api/comments/count
 * Get comment count for a single target
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
    return NextResponse.json(counts || { total_count: 0, top_level_count: 0 }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error("[api/comments/count] Error fetching count:", error);
    return NextResponse.json(
      { error: "Failed to fetch count" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/comments/count
 * Get comment counts for multiple targets (batch request)
 *
 * Body: { targetType: "moment", targetIds: ["id1", "id2", ...] }
 * Returns: { counts: { "id1": 5, "id2": 0, ... } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetType, targetIds } = body;

    if (!targetType || !targetIds) {
      return NextResponse.json(
        { error: "Missing targetType or targetIds" },
        { status: 400 }
      );
    }

    if (!["event", "moment"].includes(targetType)) {
      return NextResponse.json(
        { error: "Invalid targetType" },
        { status: 400 }
      );
    }

    if (!Array.isArray(targetIds) || targetIds.length === 0) {
      return NextResponse.json(
        { error: "targetIds must be a non-empty array" },
        { status: 400 }
      );
    }

    // Limit batch size to prevent abuse
    if (targetIds.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 targets per request" },
        { status: 400 }
      );
    }

    // Use the optimized batch function for moments
    if (targetType === "moment") {
      const countsMap = await getMomentCommentCounts(targetIds);

      // Convert Map to plain object, defaulting missing IDs to 0
      const counts: Record<string, number> = {};
      for (const id of targetIds) {
        counts[id] = countsMap.get(id) ?? 0;
      }

      return NextResponse.json({ counts }, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      });
    }

    // For events (less common batch case), return total counts
    // Can be extended similarly if needed
    return NextResponse.json(
      { error: "Batch counts for events not yet implemented" },
      { status: 501 }
    );
  } catch (error) {
    console.error("[api/comments/count] Error fetching batch counts:", error);
    return NextResponse.json(
      { error: "Failed to fetch counts" },
      { status: 500 }
    );
  }
}
