import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_CONFIG, validateBucketAndContentType } from "@/lib/storage/bucket-config";
import { R2StorageProvider } from "@/lib/storage/r2";
import { isR2Configured } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { bucket, path, contentType } = body as {
      bucket?: string;
      path?: string;
      contentType?: string;
    };

    if (!bucket || !path || !contentType) {
      return NextResponse.json(
        { error: "Missing required fields: bucket, path, contentType" },
        { status: 400 }
      );
    }

    const validationError = validateBucketAndContentType(bucket, contentType);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    if (bucket === "avatars" && !path.startsWith(user.id)) {
      return NextResponse.json(
        { error: "Can only upload to your own avatar folder" },
        { status: 403 }
      );
    }

    if (!isR2Configured()) {
      return NextResponse.json(
        { error: "R2 storage not configured" },
        { status: 503 }
      );
    }

    const provider = new R2StorageProvider();
    const { uploadId, key } = await provider.createMultipartUpload(
      bucket,
      path,
      contentType
    );

    const publicUrl = provider.getPublicUrl(bucket, path);

    return NextResponse.json({ uploadId, key, publicUrl });
  } catch (error) {
    console.error("[multipart/create] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
