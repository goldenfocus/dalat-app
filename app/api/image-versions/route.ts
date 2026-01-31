import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getImageVersions } from "@/lib/image-versions";
import type { ImageVersionContentType, ImageVersionFieldName } from "@/lib/types";

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const contentType = searchParams.get("contentType") as ImageVersionContentType;
    const contentId = searchParams.get("contentId");
    const fieldName = searchParams.get("fieldName") as ImageVersionFieldName;

    if (!contentType || !contentId || !fieldName) {
      return NextResponse.json(
        { error: "Missing required parameters: contentType, contentId, fieldName" },
        { status: 400 }
      );
    }

    const versions = await getImageVersions({
      contentType,
      contentId,
      fieldName,
    });

    return NextResponse.json({ versions });
  } catch (error) {
    console.error("[api/image-versions] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch versions" },
      { status: 500 }
    );
  }
}
