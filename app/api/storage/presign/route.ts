import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStorageProvider, isR2Configured } from "@/lib/storage";

/**
 * Valid buckets and their allowed MIME types
 */
const BUCKET_CONFIG: Record<string, string[]> = {
  avatars: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  "event-media": [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/quicktime", // .mov files from iOS
  ],
  moments: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    // Note: HEIC/HEIF removed - always converted client-side before upload
    // (storage backends like Supabase don't accept HEIC mime type)
    "video/mp4",
    "video/webm",
    "video/quicktime", // .mov files from iOS
  ],
  "venue-media": ["image/jpeg", "image/png", "image/webp", "image/gif"],
  "organizer-logos": ["image/jpeg", "image/png", "image/webp"],
  "persona-references": ["image/jpeg", "image/png", "image/webp"],
  "moment-materials": [
    "application/pdf",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/mp4",
    "audio/x-m4a",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ],
};

/**
 * Generate a presigned URL for direct upload to storage.
 * This allows clients to upload directly to R2/Supabase without
 * the file going through the server.
 *
 * POST /api/storage/presign
 * Body: { bucket: string, path: string, contentType: string }
 * Returns: { url: string, publicUrl: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { bucket, path, contentType } = body as {
      bucket?: string;
      path?: string;
      contentType?: string;
    };

    // Validate required fields
    if (!bucket || !path || !contentType) {
      return NextResponse.json(
        { error: "Missing required fields: bucket, path, contentType" },
        { status: 400 }
      );
    }

    // Validate bucket
    const allowedTypes = BUCKET_CONFIG[bucket];
    if (!allowedTypes) {
      return NextResponse.json(
        { error: `Invalid bucket: ${bucket}` },
        { status: 400 }
      );
    }

    // Validate content type
    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { error: `Content type ${contentType} not allowed for bucket ${bucket}` },
        { status: 400 }
      );
    }

    // Authorization checks based on bucket
    // For now, basic checks - can be extended per bucket
    if (bucket === "avatars") {
      // Avatars: path must start with user's ID
      if (!path.startsWith(user.id)) {
        return NextResponse.json(
          { error: "Can only upload to your own avatar folder" },
          { status: 403 }
        );
      }
    }

    // Get the appropriate storage provider
    const provider = await getStorageProvider(bucket);

    // Create presigned upload URL
    const uploadUrl = await provider.createPresignedUploadUrl(bucket, path, {
      contentType,
      expiresIn: 3600, // 1 hour
    });

    const publicUrl = provider.getPublicUrl(bucket, path);

    return NextResponse.json({
      url: uploadUrl,
      publicUrl,
      provider: isR2Configured() ? "r2" : "supabase",
    });
  } catch (error) {
    console.error("Presign error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Get storage configuration info
 *
 * GET /api/storage/presign
 * Returns: { r2Configured: boolean, buckets: string[] }
 */
export async function GET() {
  return NextResponse.json({
    r2Configured: isR2Configured(),
    buckets: Object.keys(BUCKET_CONFIG),
  });
}
