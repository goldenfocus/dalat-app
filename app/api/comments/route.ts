import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import {
  getCommentsWithTranslations,
  createComment,
  getContentOwner,
} from "@/lib/comments";
import type { CommentTargetType, Locale } from "@/lib/types";

/**
 * GET /api/comments
 * Fetch comments for a target (event or moment)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetType = searchParams.get("targetType") as CommentTargetType;
  const targetId = searchParams.get("targetId");
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const sort = (searchParams.get("sort") || "newest") as "newest" | "oldest";
  const locale = (searchParams.get("locale") || "en") as Locale;

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
    const comments = await getCommentsWithTranslations(
      targetType,
      targetId,
      locale,
      { limit: limit + 1, offset, sort }
    );

    // Check if there are more comments
    const hasMore = comments.length > limit;
    if (hasMore) {
      comments.pop();
    }

    return NextResponse.json({ comments, hasMore });
  } catch (error) {
    console.error("[api/comments] Error fetching comments:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/comments
 * Create a new comment or reply
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
    const { targetType, targetId, content, parentId, sourceLocale } = body;

    if (!targetType || !targetId || !content) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!["event", "moment"].includes(targetType)) {
      return NextResponse.json(
        { error: "Invalid targetType" },
        { status: 400 }
      );
    }

    // Create the comment
    const result = await createComment(targetType, targetId, content, {
      parentId,
      sourceLocale: sourceLocale || "en",
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to create comment" },
        { status: 400 }
      );
    }

    // Get the created comment with profile info
    const { data: comment } = await supabase
      .rpc("get_comments", {
        p_target_type: targetType,
        p_target_id: targetId,
        p_limit: 1,
        p_offset: 0,
        p_sort: "newest",
      })
      .then((res) => ({
        data: res.data?.find((c: { id: string }) => c.id === result.comment_id),
      }));

    // Get content owner info for notification
    const contentOwner = await getContentOwner(targetType, targetId);

    // Send notification via Inngest
    if (contentOwner && result.comment_id) {
      // Get user profile for commenter name
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, username")
        .eq("id", user.id)
        .single();

      await inngest.send({
        name: "comment/created",
        data: {
          commentId: result.comment_id,
          contentType: targetType,
          contentId: targetId,
          contentOwnerId: contentOwner.ownerId,
          contentTitle: contentOwner.title,
          eventSlug: contentOwner.slug,
          commentAuthorId: user.id,
          commentContent: content,
          parentCommentId: parentId,
          parentCommentAuthorId: result.parent_author_id,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      comment_id: result.comment_id,
      comment,
    });
  } catch (error) {
    console.error("[api/comments] Error creating comment:", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
}
