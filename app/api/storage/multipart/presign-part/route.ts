import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_CONFIG } from "@/lib/storage/bucket-config";
import { R2StorageProvider } from "@/lib/storage/r2";
import { isR2Configured } from "@/lib/storage";

const MAX_BATCH_SIZE = 100;

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
    const { bucket, path, uploadId, partNumbers: rawPartNumbers, partNumber } = body as {
      bucket?: string;
      path?: string;
      uploadId?: string;
      partNumbers?: number[];
      partNumber?: number;
    };

    if (!bucket || !path || !uploadId) {
      return NextResponse.json(
        { error: "Missing required fields: bucket, path, uploadId" },
        { status: 400 }
      );
    }

    const partNumbers = rawPartNumbers ?? (partNumber ? [partNumber] : null);

    if (!partNumbers || partNumbers.length === 0) {
      return NextResponse.json(
        { error: "Missing partNumbers (array) or partNumber (number)" },
        { status: 400 }
      );
    }

    if (partNumbers.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BATCH_SIZE} parts per batch request` },
        { status: 400 }
      );
    }

    if (partNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > 10000)) {
      return NextResponse.json(
        { error: "Part numbers must be integers between 1 and 10000" },
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
    const urls = await provider.createPresignedPartUrls(
      bucket,
      path,
      uploadId,
      partNumbers
    );

    return NextResponse.json({ urls });
  } catch (error) {
    console.error("[multipart/presign-part] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
