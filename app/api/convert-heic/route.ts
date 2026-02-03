/**
 * @deprecated This endpoint is no longer used.
 *
 * HEIC conversion now works as follows:
 * 1. Client-side heic2any conversion is attempted first
 * 2. If that fails, HEIC is uploaded directly to R2 (presigned URL bypasses Cloudflare WAF)
 * 3. Cloudflare Image Resizing converts HEIC to WebP/AVIF on-the-fly when displaying
 *
 * This endpoint was blocked by Cloudflare WAF (403 on file uploads).
 * Additionally, CLOUDCONVERT_API_KEY is not configured in production.
 *
 * TODO: Remove this file once confirmed the new approach works in production.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Allow longer execution for CloudConvert conversion
export const maxDuration = 60;

const CLOUDCONVERT_API_KEY = process.env.CLOUDCONVERT_API_KEY;
const CLOUDCONVERT_API_URL = "https://api.cloudconvert.com/v2";

const RATE_LIMIT = 30; // requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface CloudConvertTask {
  id: string;
  operation: string;
  status: string;
  result?: {
    files?: Array<{ url: string; filename: string }>;
    form?: { url: string; parameters: Record<string, string> };
  };
  message?: string;
}

interface CloudConvertJob {
  id: string;
  status: string;
  tasks: CloudConvertTask[];
}

/**
 * Convert HEIC to JPEG using CloudConvert API
 * More reliable than local heic-convert which has codec compatibility issues
 */
async function convertWithCloudConvert(file: File): Promise<Buffer> {
  if (!CLOUDCONVERT_API_KEY) {
    throw new Error("CloudConvert not configured");
  }

  // Step 1: Create conversion job
  const jobResponse = await fetch(`${CLOUDCONVERT_API_URL}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLOUDCONVERT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tasks: {
        "import-file": {
          operation: "import/upload",
        },
        "convert-image": {
          operation: "convert",
          input: "import-file",
          output_format: "jpg",
          quality: 90,
        },
        "export-result": {
          operation: "export/url",
          input: "convert-image",
        },
      },
    }),
  });

  if (!jobResponse.ok) {
    const error = await jobResponse.json();
    console.error("[convert-heic] CloudConvert job creation failed:", error);
    throw new Error("Failed to create conversion job");
  }

  const job: { data: CloudConvertJob } = await jobResponse.json();
  const importTask = job.data.tasks.find((t) => t.operation === "import/upload");

  if (!importTask) {
    throw new Error("Failed to get upload task");
  }

  // Step 2: Get upload URL
  const uploadResponse = await fetch(
    `${CLOUDCONVERT_API_URL}/import/upload/tasks/${importTask.id}`,
    {
      headers: { Authorization: `Bearer ${CLOUDCONVERT_API_KEY}` },
    }
  );

  if (!uploadResponse.ok) {
    throw new Error("Failed to get upload URL");
  }

  const uploadData: { data: { result: { form: { url: string; parameters: Record<string, string> } } } } =
    await uploadResponse.json();

  // Step 3: Upload file
  const formData = new FormData();
  Object.entries(uploadData.data.result.form.parameters).forEach(([key, value]) => {
    formData.append(key, value);
  });
  formData.append("file", file);

  const uploadResult = await fetch(uploadData.data.result.form.url, {
    method: "POST",
    body: formData,
  });

  if (!uploadResult.ok) {
    throw new Error("Failed to upload file to CloudConvert");
  }

  // Step 4: Poll for completion (max 30 seconds)
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const statusResponse = await fetch(`${CLOUDCONVERT_API_URL}/jobs/${job.data.id}`, {
      headers: { Authorization: `Bearer ${CLOUDCONVERT_API_KEY}` },
    });

    if (!statusResponse.ok) continue;

    const statusData: { data: CloudConvertJob } = await statusResponse.json();

    if (statusData.data.status === "error") {
      const errorTask = statusData.data.tasks.find((t) => t.status === "error");
      throw new Error(errorTask?.message || "Conversion failed");
    }

    if (statusData.data.status === "finished") {
      const exportTask = statusData.data.tasks.find((t) => t.operation === "export/url");
      const downloadUrl = exportTask?.result?.files?.[0]?.url;

      if (!downloadUrl) {
        throw new Error("No download URL available");
      }

      // Step 5: Download converted file
      const jpegResponse = await fetch(downloadUrl);
      if (!jpegResponse.ok) {
        throw new Error("Failed to download converted file");
      }

      const arrayBuffer = await jpegResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  }

  throw new Error("Conversion timed out");
}

/**
 * POST: Convert HEIC/HEIF to JPEG using CloudConvert
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
      "[convert-heic] Converting:",
      file.name,
      "size:",
      file.size,
      "type:",
      file.type
    );

    // Use CloudConvert for reliable HEIC conversion
    const jpegBuffer = await convertWithCloudConvert(file);

    console.log("[convert-heic] Conversion complete, output size:", jpegBuffer.length);

    // Return the converted JPEG
    return new NextResponse(new Uint8Array(jpegBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": jpegBuffer.length.toString(),
        "X-Original-Name": file.name.replace(/\.(heic|heif)$/i, ".jpg"),
      },
    });
  } catch (error) {
    console.error("[convert-heic] Error:", error);
    const message = error instanceof Error ? error.message : "Conversion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
