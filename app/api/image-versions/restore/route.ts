import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { restoreImageVersion, getImageVersion } from "@/lib/image-versions";

export async function POST(request: Request) {
  try {
    // Authentication check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { versionId } = await request.json();

    if (!versionId) {
      return NextResponse.json(
        { error: "Missing versionId" },
        { status: 400 }
      );
    }

    // Check if user owns this version
    const version = await getImageVersion(versionId);
    if (!version) {
      return NextResponse.json(
        { error: "Version not found" },
        { status: 404 }
      );
    }

    // Verify ownership based on content type
    const isOwner = await verifyContentOwnership(
      supabase,
      user.id,
      version.content_type,
      version.content_id
    );

    if (!isOwner) {
      return NextResponse.json(
        { error: "Not authorized to restore this version" },
        { status: 403 }
      );
    }

    const result = await restoreImageVersion(versionId);

    if (!result) {
      return NextResponse.json(
        { error: "Failed to restore version" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      imageUrl: result.imageUrl,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error("[api/image-versions/restore] Error:", error);
    return NextResponse.json(
      { error: "Failed to restore version" },
      { status: 500 }
    );
  }
}

/**
 * Verify the user owns the content they're trying to restore
 */
async function verifyContentOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  contentType: string,
  contentId: string
): Promise<boolean> {
  switch (contentType) {
    case "event": {
      const { data } = await supabase
        .from("events")
        .select("created_by")
        .eq("id", contentId)
        .single();
      return data?.created_by === userId;
    }
    case "blog": {
      const { data } = await supabase
        .from("blog_posts")
        .select("author_id")
        .eq("id", contentId)
        .single();
      return data?.author_id === userId;
    }
    case "profile": {
      return contentId === userId;
    }
    case "venue": {
      const { data } = await supabase
        .from("venues")
        .select("created_by")
        .eq("id", contentId)
        .single();
      return data?.created_by === userId;
    }
    case "organizer": {
      const { data } = await supabase
        .from("organizers")
        .select("owner_id")
        .eq("id", contentId)
        .single();
      return data?.owner_id === userId;
    }
    default:
      return false;
  }
}
