/**
 * Convert HEIC to JPEG server-side using sharp
 *
 * Strategy to bypass Cloudflare WAF:
 * 1. Client uploads HEIC directly to R2 via presigned URL (bypasses WAF)
 * 2. Client calls this API with the R2 path
 * 3. Server reads HEIC from R2, converts with sharp, saves JPEG back to R2
 * 4. Server deletes original HEIC
 * 5. Returns JPEG URL
 *
 * This works because:
 * - File upload goes directly to R2 (not through our server)
 * - This API only receives a path string (not file data)
 * - Sharp has excellent HEIC support via libvips
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { getR2Config } from "@/lib/storage/r2-config";

export const maxDuration = 60; // Allow longer execution

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
 * POST: Convert HEIC file already uploaded to R2
 *
 * Body: { bucket: string, path: string }
 * Returns: { url: string } - URL of converted JPEG
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
    const body = await request.json();
    const { bucket, path } = body as { bucket?: string; path?: string };

    if (!bucket || !path) {
      return NextResponse.json({ error: "Missing bucket or path" }, { status: 400 });
    }

    // Validate file extension
    if (!path.toLowerCase().endsWith(".heic") && !path.toLowerCase().endsWith(".heif")) {
      return NextResponse.json({ error: "File is not HEIC/HEIF" }, { status: 400 });
    }

    // Security: Validate path format (should be eventId/userId/filename)
    const pathParts = path.split("/");
    if (pathParts.length < 3) {
      return NextResponse.json({ error: "Invalid path format" }, { status: 400 });
    }

    console.log("[convert-heic-r2] Converting:", bucket, path);

    // Read HEIC from R2
    const key = `${bucket}/${path}`;
    const getCommand = new GetObjectCommand({
      Bucket: r2.bucketName,
      Key: key,
    });

    const response = await r2.client.send(getCommand);
    if (!response.Body) {
      return NextResponse.json({ error: "File not found in R2" }, { status: 404 });
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const heicBuffer = Buffer.concat(chunks);

    console.log("[convert-heic-r2] Read HEIC:", heicBuffer.length, "bytes");

    // Convert to JPEG using sharp
    const jpegBuffer = await sharp(heicBuffer)
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    console.log("[convert-heic-r2] Converted to JPEG:", jpegBuffer.length, "bytes");

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

    // Delete original HEIC
    const deleteCommand = new DeleteObjectCommand({
      Bucket: r2.bucketName,
      Key: key,
    });

    await r2.client.send(deleteCommand);

    const publicUrl = `${r2.publicUrl}/${jpegKey}`;
    console.log("[convert-heic-r2] Complete:", publicUrl);

    return NextResponse.json({
      url: publicUrl,
      path: jpegPath,
      originalSize: heicBuffer.length,
      convertedSize: jpegBuffer.length,
    });
  } catch (error) {
    console.error("[convert-heic-r2] Error:", error);
    const message = error instanceof Error ? error.message : "Conversion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
