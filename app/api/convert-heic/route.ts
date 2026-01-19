import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require("sharp");

// Allow larger files and longer execution
export const maxDuration = 30;

/**
 * POST: Convert HEIC/HEIF to JPEG using Sharp
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
    const buffer = Buffer.from(arrayBuffer);

    // Use Sharp to convert HEIC to JPEG
    const jpegBuffer = await sharp(buffer)
      .jpeg({ quality: 90 })
      .toBuffer();

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

    // Check for Sharp-specific errors
    const message =
      error instanceof Error ? error.message : "Conversion failed";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
