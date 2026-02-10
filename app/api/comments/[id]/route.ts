import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteComment, editComment } from "@/lib/comments";
import { triggerTranslationServer } from "@/lib/translations";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/comments/[id]
 * Delete a comment (soft delete)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const result = await deleteComment(id);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to delete comment" },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/comments/delete] Error deleting comment:", error);
    return NextResponse.json(
      { error: "Failed to delete comment" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/comments/[id]
 * Edit a comment
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json(
        { error: "Missing content" },
        { status: 400 }
      );
    }

    const result = await editComment(id, content);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to edit comment" },
        { status: 400 }
      );
    }

    // Re-trigger translation to update all 12 languages with edited content
    // Uses server-side function to avoid auth issues with internal fetch
    triggerTranslationServer("comment", id, [
      { field_name: "content", text: content },
    ]).catch((err) => {
      console.error("[api/comments/edit] Translation failed:", err);
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/comments/edit] Error editing comment:", error);
    return NextResponse.json(
      { error: "Failed to edit comment" },
      { status: 500 }
    );
  }
}
