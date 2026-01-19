import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const convert = require("heic-convert");

// Allow larger files and longer execution for HEIC conversion
export const maxDuration = 60;

/**
 * POST: Convert HEIC/HEIF to JPEG using heic-convert (pure JS)
 * Accepts multipart form data with a "file" field
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const ext = file.name.split(".").pop()?.toLowerCase();
    const isHeic =
      file.type === "image/heic" ||
      file.type === "image/heif" ||
      ext === "heic" ||
      ext === "heif";

    if (!isHeic) {
      return NextResponse.json(
        { error: "File is not HEIC/HEIF format" },
        { status: 400 }
      );
    }

    console.log(
      "[API] Converting HEIC:",
      file.name,
      "size:",
      file.size,
      "type:",
      file.type
    );

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Use heic-convert (pure JS, works on all platforms)
    const jpegBuffer = await convert({
      buffer: inputBuffer,
      format: "JPEG",
      quality: 0.9,
    });

    console.log(
      "[API] Conversion complete, output size:",
      jpegBuffer.length
    );

    // Return the converted JPEG
    return new NextResponse(jpegBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": jpegBuffer.length.toString(),
        "X-Original-Name": file.name.replace(/\.(heic|heif)$/i, ".jpg"),
      },
    });
  } catch (error) {
    console.error("[API] HEIC conversion error:", error);

    const message =
      error instanceof Error ? error.message : "Conversion failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
