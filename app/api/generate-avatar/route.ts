import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueImageJob } from "@/lib/ai/image-jobs";

/**
 * Enqueues an avatar generation job for the Mac mini worker (local FLUX)
 * and returns 202 + jobId. Clients poll /api/ai/generate-image/status.
 */

const RATE_LIMIT = 5; // requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Sanitize display name to prevent prompt injection
function sanitizeDisplayName(name: string | undefined): string {
  if (!name?.trim()) return "";
  // Remove quotes, newlines, and limit length
  return name
    .replace(/["'\n\r]/g, "")
    .slice(0, 50)
    .trim();
}

// Sanitize custom prompt to prevent prompt injection
function sanitizeCustomPrompt(prompt: string | undefined): string {
  if (!prompt?.trim()) return "";
  // Remove potentially harmful characters and limit length
  return prompt
    .replace(/["'\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 200)
    .trim();
}

type AvatarStyle = "male" | "female" | "neutral" | "custom";

const styleDescriptions: Record<AvatarStyle, string> = {
  male: "masculine-presenting person with strong, defined features",
  female: "feminine-presenting person with soft, elegant features",
  neutral: "person with androgynous, gender-neutral features that could be any gender",
  custom: "", // Will use custom prompt
};

export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Database-backed rate limiting (survives cold starts). Fails closed:
    // enqueueing is cheap for an attacker.
    const { data: rateCheck, error: rateError } = await supabase.rpc('check_rate_limit', {
      p_action: 'generate_avatar',
      p_limit: RATE_LIMIT,
      p_window_ms: RATE_WINDOW_MS,
    });

    if (rateError) {
      console.error("[generate-avatar] Rate limit check failed:", rateError);
      return NextResponse.json(
        { error: "Try again in a moment.", code: "rate_limit_unavailable" },
        { status: 503 }
      );
    }
    if (!rateCheck?.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Try again in an hour.",
          remaining: 0,
          reset_at: rateCheck?.reset_at,
        },
        { status: 429 }
      );
    }

    const { displayName, style = "neutral", customPrompt } = await request.json();

    // Sanitize inputs
    const sanitizedName = sanitizeDisplayName(displayName);
    const sanitizedCustomPrompt = sanitizeCustomPrompt(customPrompt);
    const avatarStyle = (style as AvatarStyle) || "neutral";

    // Build name context
    const nameContext = sanitizedName
      ? `for someone named ${sanitizedName}`
      : "for a friendly person";

    let prompt: string;

    // For custom prompts, give the user FULL creative control
    if (avatarStyle === "custom" && sanitizedCustomPrompt) {
      prompt = `Create a portrait avatar ${nameContext}.

${sanitizedCustomPrompt}

Technical requirements:
- Square 1:1 aspect ratio
- Centered composition suitable for circular avatar crop
- Do NOT include any text or lettering
- High quality, detailed image`;
    } else {
      // For preset styles, use the Đà Lạt-inspired artistic style
      const styleDesc = styleDescriptions[avatarStyle] || styleDescriptions.neutral;

      prompt = `Create a beautiful, artistic avatar portrait ${nameContext}.

The avatar should depict a ${styleDesc}

Style: Dreamy, ethereal digital art inspired by Đà Lạt, Vietnam's misty highlands.
Colors: Soft pastels with hints of misty purple, pine forest green, warm sunset orange, and flower pink.
Feel: Warm, welcoming, and slightly magical - like a peaceful morning in the mountains.
Composition: Abstract or stylized portrait, centered, suitable for a circular avatar crop.
Background: Soft gradient or gentle atmospheric elements (mist, soft bokeh, subtle nature motifs).
Important:
- Abstract/artistic style, NOT photorealistic
- Do NOT include any text or lettering
- Square 1:1 aspect ratio
- Suitable for use as a profile picture`;
    }

    const result = await enqueueImageJob({
      supabase,
      userId: user.id,
      context: "avatar",
      prompt,
      entityId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status ?? 500 }
      );
    }

    return NextResponse.json({ jobId: result.jobId }, { status: 202 });
  } catch (error) {
    console.error("Avatar generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate avatar" },
      { status: 500 }
    );
  }
}
