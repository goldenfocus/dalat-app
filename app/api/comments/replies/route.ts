import { NextRequest, NextResponse } from "next/server";
import { getRepliesWithTranslations } from "@/lib/comments";
import type { Locale } from "@/lib/types";

/**
 * GET /api/comments/replies
 * Fetch replies for a parent comment
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parentId");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const locale = (searchParams.get("locale") || "en") as Locale;

  if (!parentId) {
    return NextResponse.json(
      { error: "Missing parentId" },
      { status: 400 }
    );
  }

  try {
    const replies = await getRepliesWithTranslations(parentId, locale, {
      limit,
      offset,
    });

    return NextResponse.json({ replies });
  } catch (error) {
    console.error("[api/comments/replies] Error fetching replies:", error);
    return NextResponse.json(
      { error: "Failed to fetch replies" },
      { status: 500 }
    );
  }
}
