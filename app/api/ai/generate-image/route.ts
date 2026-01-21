import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateImage,
  refineImage,
  buildPrompt,
  PROMPT_TEMPLATES,
  type ImageContext,
} from "@/lib/ai/image-generator";

// Image generation can take 30-60s
export const maxDuration = 60;

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
  /** Base64-encoded image data for refinement (alternative to existingImageUrl) */
  imageBase64?: string;
  /** MIME type when using imageBase64 */
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

    // Database-backed rate limiting (survives serverless cold starts)
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
      // Fail open but log the error
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
      imageMimeType,
    } = body;

    // Validate context
    if (!PROMPT_TEMPLATES[context]) {
      return NextResponse.json(
        { error: `Invalid context: ${context}. Valid: ${Object.keys(PROMPT_TEMPLATES).join(", ")}` },
        { status: 400 }
      );
    }

    let imageUrl: string;

    // Sanitize user-provided prompts to prevent injection
    const sanitizedCustomPrompt = sanitizePrompt(customPrompt);
    const sanitizedRefinementPrompt = sanitizePrompt(refinementPrompt);

    // Refinement mode - supports both URL and base64 input
    const hasImageSource = existingImageUrl || (imageBase64 && imageMimeType);
    if (hasImageSource && sanitizedRefinementPrompt) {
      imageUrl = await refineImage({
        context,
        existingImageUrl,
        refinementPrompt: sanitizedRefinementPrompt,
        entityId,
        imageBase64,
        imageMimeType,
      });
    } else {
      // New generation mode - prefer template-based prompt over custom
      const prompt = sanitizedCustomPrompt || buildPrompt(context, title, content);
      imageUrl = await generateImage({
        context,
        prompt,
        entityId,
      });
    }

    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("[api/ai/generate-image] Error:", error);

    if (error instanceof Error) {
      if (error.message.includes("quota") || error.message.includes("limit")) {
        return NextResponse.json({ error: "AI generation limit reached. Try again later." }, { status: 429 });
      }
      if (error.message.includes("not configured")) {
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}
