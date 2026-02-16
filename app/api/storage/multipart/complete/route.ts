import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_CONFIG } from "@/lib/storage/bucket-config";
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
    const { bucket, path, uploadId, parts, abort } = body as {
      bucket?: string;
      path?: string;
      uploadId?: string;
      parts?: Array<{ partNumber: number; etag: string }>;
      abort?: boolean;
    };

    if (!bucket || !path || !uploadId) {
      return NextResponse.json(
        { error: "Missing required fields: bucket, path, uploadId" },
        { status: 400 }
      );
    }

    if (!BUCKET_CONFIG[bucket]) {
      return NextResponse.json(
        { error: `Invalid bucket: ${bucket}` },
        { status: 400 }
      );
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

    if (abort) {
      await provider.abortMultipartUpload(bucket, path, uploadId);
      return NextResponse.json({ aborted: true });
    }

    if (!parts || parts.length === 0) {
      return NextResponse.json(
        { error: "Parts array is required for completion (or set abort: true)" },
        { status: 400 }
      );
    }

    for (const part of parts) {
      if (!Number.isInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > 10000) {
        return NextResponse.json(
          { error: `Invalid partNumber: ${part.partNumber}` },
          { status: 400 }
        );
      }
      if (!part.etag) {
        return NextResponse.json(
          { error: `Missing etag for part ${part.partNumber}` },
          { status: 400 }
        );
      }
    }

    const { publicUrl } = await provider.completeMultipartUpload(
      bucket,
      path,
      uploadId,
      parts
    );

    return NextResponse.json({ publicUrl });
  } catch (error) {
    console.error("[multipart/complete] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
