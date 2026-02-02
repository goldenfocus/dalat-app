import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

/**
 * POST /api/moments/process
 * Triggers AI processing for a newly created moment.
 * Fire-and-forget - doesn't block moment creation.
 */
export async function POST(request: NextRequest) {
  try {
    const { momentId } = await request.json();

    if (!momentId) {
      return NextResponse.json(
        { error: "Missing momentId" },
        { status: 400 }
      );
    }

    // Trigger the Inngest job to process the moment
    await inngest.send({
      name: "moment/process-metadata",
      data: { momentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to trigger moment processing:", error);
    // Don't fail the request - processing is non-critical
    return NextResponse.json(
      { error: "Failed to trigger processing" },
      { status: 500 }
    );
  }
}
