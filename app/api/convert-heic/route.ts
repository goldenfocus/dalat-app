import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const convert = require("heic-convert");

// Allow larger files and longer execution for HEIC conversion
export const maxDuration = 60;

const RATE_LIMIT = 30; // requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * POST: Convert HEIC/HEIF to JPEG using heic-convert (pure JS)
 * Accepts multipart form data with a "file" field
 */
export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  // Database-backed rate limiting
  const { data: rateCheck, error: rateError } = await supabase.rpc('check_rate_limit', {
    p_action: 'convert_heic',
    p_limit: RATE_LIMIT,
    p_window_ms: RATE_WINDOW_MS,
  });

  if (rateError) {
    console.error("[convert-heic] Rate limit check failed:", rateError);
  } else if (!rateCheck?.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Try again later.",
        remaining: 0,
        reset_at: rateCheck?.reset_at,
      },
      { status: 429 }
    );
  }

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
    return NextResponse.json({ error: "Conversion failed" }, { status: 500 });
  }
}
