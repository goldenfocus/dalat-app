/**
 * Upload and convert HEIC to JPEG server-side
 *
 * This endpoint bypasses R2 CORS issues by:
 * 1. Accepting HEIC file upload directly to our server
 * 2. Converting to JPEG using sharp (libvips)
 * 3. Uploading the JPEG to R2 server-side
 *
 * This is slower than presigned URL uploads but works when
 * R2 CORS isn't configured for browser PUT requests.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { getR2Config } from "@/lib/storage/r2-config";

export const maxDuration = 60; // Allow longer execution for large files

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Create S3 client for R2 using centralized config (with .trim() protection)
 */
function createR2Client() {
  const config = getR2Config();
  if (!config) return null;

  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return { client, bucketName: config.bucketName, publicUrl: config.publicUrl };
}

/**
 * POST: Upload HEIC file, convert to JPEG, save to R2
 *
 * FormData: { file: File, bucket: string, path: string }
 * Returns: { url: string, path: string } - URL of converted JPEG
 */
export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Get R2 client (uses centralized config with .trim() protection)
  const r2 = createR2Client();
  if (!r2) {
    return NextResponse.json({ error: "R2 storage not configured" }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const bucket = formData.get("bucket") as string | null;
    const path = formData.get("path") as string | null;

    if (!file || !bucket || !path) {
      return NextResponse.json({ error: "Missing file, bucket, or path" }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
    }

    // Validate file type
    const ext = file.name.split(".").pop()?.toLowerCase();
    const isHeic = file.type === "image/heic" || file.type === "image/heif" || ext === "heic" || ext === "heif";

    if (!isHeic) {
      return NextResponse.json({ error: "Only HEIC/HEIF files are accepted" }, { status: 400 });
    }

    console.log("[upload-heic] Processing:", file.name, file.size, "bytes");

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const heicBuffer = Buffer.from(arrayBuffer);

    console.log("[upload-heic] Converting to JPEG...");

    // Convert to JPEG using sharp
    const jpegBuffer = await sharp(heicBuffer)
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    console.log("[upload-heic] Converted:", jpegBuffer.length, "bytes");

    // Generate JPEG path (replace extension)
    const jpegPath = path.replace(/\.(heic|heif)$/i, ".jpg");
    const jpegKey = `${bucket}/${jpegPath}`;

    // Upload JPEG to R2
    const putCommand = new PutObjectCommand({
      Bucket: r2.bucketName,
      Key: jpegKey,
      Body: jpegBuffer,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
    });

    await r2.client.send(putCommand);

    const publicUrl = `${r2.publicUrl}/${jpegKey}`;
    console.log("[upload-heic] Complete:", publicUrl);

    return NextResponse.json({
      url: publicUrl,
      path: jpegPath,
      originalSize: heicBuffer.length,
      convertedSize: jpegBuffer.length,
    });
  } catch (error) {
    console.error("[upload-heic] Error:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
