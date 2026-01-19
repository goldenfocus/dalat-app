import { NextRequest, NextResponse } from "next/server";

// Allow longer execution for video conversion polling
export const maxDuration = 60;

const CLOUDCONVERT_API_KEY = process.env.CLOUDCONVERT_API_KEY;
const CLOUDCONVERT_API_URL = "https://api.cloudconvert.com/v2";

interface CloudConvertTask {
  id: string;
  name: string;
  operation: string;
  status: string;
  progress?: number;
  result?: {
    files?: Array<{ url: string; filename: string }>;
  };
  message?: string;
}

interface CloudConvertJob {
  id: string;
  status: string;
  tasks: CloudConvertTask[];
}

/**
 * POST: Create a new conversion job and return upload URL
 */
export async function POST(request: NextRequest) {
  if (!CLOUDCONVERT_API_KEY) {
    return NextResponse.json(
      { error: "Video conversion not configured" },
      { status: 503 }
    );
  }

  try {
    const { filename, filesize } = await request.json();

    if (!filename || !filesize) {
      return NextResponse.json(
        { error: "Missing filename or filesize" },
        { status: 400 }
      );
    }

    // Create job with import, convert, and export tasks
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
          "convert-video": {
            operation: "convert",
            input: "import-file",
            output_format: "mp4",
            video_codec: "h264",
            audio_codec: "aac",
            // Good quality, reasonable file size
            crf: 23,
          },
          "export-result": {
            operation: "export/url",
            input: "convert-video",
          },
        },
      }),
    });

    if (!jobResponse.ok) {
      const error = await jobResponse.json();
      console.error("CloudConvert job creation failed:", error);
      return NextResponse.json(
        { error: "Failed to create conversion job" },
        { status: 500 }
      );
    }

    const job: { data: CloudConvertJob } = await jobResponse.json();
    const importTask = job.data.tasks.find(
      (t) => t.operation === "import/upload"
    );

    if (!importTask) {
      return NextResponse.json(
        { error: "Failed to get upload task" },
        { status: 500 }
      );
    }

    // Get upload URL for the import task
    const uploadResponse = await fetch(
      `${CLOUDCONVERT_API_URL}/import/upload/tasks/${importTask.id}`,
      {
        headers: {
          Authorization: `Bearer ${CLOUDCONVERT_API_KEY}`,
        },
      }
    );

    if (!uploadResponse.ok) {
      return NextResponse.json(
        { error: "Failed to get upload URL" },
        { status: 500 }
      );
    }

    const uploadData: {
      data: { result: { form: { url: string; parameters: object } } };
    } = await uploadResponse.json();

    return NextResponse.json({
      jobId: job.data.id,
      uploadUrl: uploadData.data.result.form.url,
      uploadFields: uploadData.data.result.form.parameters,
    });
  } catch (error) {
    console.error("Convert video error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET: Check job status and return download URL when complete
 */
export async function GET(request: NextRequest) {
  if (!CLOUDCONVERT_API_KEY) {
    return NextResponse.json(
      { error: "Video conversion not configured" },
      { status: 503 }
    );
  }

  const jobId = request.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  try {
    const response = await fetch(`${CLOUDCONVERT_API_URL}/jobs/${jobId}`, {
      headers: {
        Authorization: `Bearer ${CLOUDCONVERT_API_KEY}`,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to check job status" },
        { status: 500 }
      );
    }

    const job: { data: CloudConvertJob } = await response.json();

    // Check overall job status
    if (job.data.status === "error") {
      const errorTask = job.data.tasks.find((t) => t.status === "error");
      return NextResponse.json({
        status: "error",
        error: errorTask?.message || "Conversion failed",
      });
    }

    if (job.data.status === "finished") {
      // Find export task and get download URL
      const exportTask = job.data.tasks.find(
        (t) => t.operation === "export/url"
      );
      const downloadUrl = exportTask?.result?.files?.[0]?.url;

      if (!downloadUrl) {
        return NextResponse.json({
          status: "error",
          error: "No download URL available",
        });
      }

      return NextResponse.json({
        status: "finished",
        downloadUrl,
      });
    }

    // Job still processing - return progress
    const convertTask = job.data.tasks.find((t) => t.operation === "convert");
    return NextResponse.json({
      status: "processing",
      progress: convertTask?.progress || 0,
    });
  } catch (error) {
    console.error("Check job status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
