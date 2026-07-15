import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPrompt, PROMPT_TEMPLATES, type ImageContext } from "@/lib/ai/image-generator";
import { enqueueImageJob, QUEUE_CONTEXTS, type QueueImageContext } from "@/lib/ai/image-jobs";

/**
 * Enqueues an image generation job for the Mac mini worker (local FLUX,
 * zero cost) and returns 202 + jobId. Clients poll /status until done.
 *
 * Replaced the synchronous Gemini call — the Google key died with the
 * GCP billing lapse, and generation is now local-first by design.
 */

// Rate limiting config
const RATE_LIMIT = 10; // requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Sanitize custom prompt to prevent prompt injection
 * Limits length and removes potentially harmful characters
 */
function sanitizePrompt(prompt: string | undefined): string {
  if (!prompt?.trim()) return "";
  return prompt
    .replace(/["'\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 500)
    .trim();
}

interface GenerateImageRequest {
  context: ImageContext;
  title?: string;
  content?: string;
  customPrompt?: string;
  existingImageUrl?: string;
  refinementPrompt?: string;
  entityId?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export async function POST(request: Request) {
  try {
    // Authentication check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Database-backed rate limiting (survives serverless cold starts).
    // Fails CLOSED: enqueueing is cheap for an attacker, so an unreadable
    // rate limit must not become an open one.
    const { data: rateCheck, error: rateError } = await supabase.rpc(
      "check_rate_limit",
      {
        p_action: "generate_image",
        p_limit: RATE_LIMIT,
        p_window_ms: RATE_WINDOW_MS,
      }
    );

    if (rateError) {
      console.error("[api/ai/generate-image] Rate limit check failed:", rateError);
      return NextResponse.json(
        { error: "Try again in a moment.", code: "rate_limit_unavailable" },
        { status: 503 }
      );
    }
    if (!rateCheck?.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Try again later.",
          remaining: 0,
          reset_at: rateCheck?.reset_at,
        },
        { status: 429 }
      );
    }

    const body: GenerateImageRequest = await request.json();
    const {
      context,
      title = "",
      content,
      customPrompt,
      existingImageUrl,
      refinementPrompt,
      entityId,
      imageBase64,
    } = body;

    // Validate context
    if (!PROMPT_TEMPLATES[context]) {
      return NextResponse.json(
        { error: `Invalid context: ${context}. Valid: ${Object.keys(PROMPT_TEMPLATES).join(", ")}` },
        { status: 400 }
      );
    }

    // Refinement (image-to-image) isn't supported by the local worker yet.
    if (existingImageUrl || imageBase64 || refinementPrompt) {
      return NextResponse.json(
        {
          error: "Image refinement is temporarily unavailable. Generate a new image instead.",
          code: "refine_unavailable",
        },
        { status: 503 }
      );
    }

    // Logo contexts render badly on the local model — keep them off
    // rather than shipping garbled marks under the same button.
    if (!(context in QUEUE_CONTEXTS)) {
      return NextResponse.json(
        {
          error: "AI generation for this image type is temporarily unavailable.",
          code: "context_unavailable",
        },
        { status: 503 }
      );
    }

    const sanitizedCustomPrompt = sanitizePrompt(customPrompt);
    const prompt = sanitizedCustomPrompt || buildPrompt(context, title, content);

    const result = await enqueueImageJob({
      supabase,
      userId: user.id,
      context: context as QueueImageContext,
      prompt,
      entityId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status ?? 500 }
      );
    }

    return NextResponse.json({ jobId: result.jobId }, { status: 202 });
  } catch (error) {
    console.error("[api/ai/generate-image] Error:", error);
    return NextResponse.json(
      { error: "Generation failed. Check server logs for details." },
      { status: 500 }
    );
  }
}
