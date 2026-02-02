import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Gemini image generation can take 30-60s
export const maxDuration = 60;

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

    // Database-backed rate limiting (survives cold starts)
    const { data: rateCheck, error: rateError } = await supabase.rpc('check_rate_limit', {
      p_action: 'generate_avatar',
      p_limit: RATE_LIMIT,
      p_window_ms: RATE_WINDOW_MS,
    });

    if (rateError) {
      console.error("[generate-avatar] Rate limit check failed:", rateError);
      // Fail open - allow request but log the error
    } else if (!rateCheck?.allowed) {
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

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI generation is not configured" },
        { status: 503 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      } as never,
    });

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

    console.log("[generate-avatar] Calling Gemini for avatar generation");

    const result = await model.generateContent(prompt);
    const response = result.response;

    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) {
      console.error("[generate-avatar] No parts in response");
      throw new Error("No response from AI model");
    }

    const imagePart = parts.find(
      (part) => "inlineData" in part && part.inlineData?.mimeType?.startsWith("image/")
    );

    if (!imagePart || !("inlineData" in imagePart)) {
      console.error("[generate-avatar] No image part found");
      throw new Error("No image generated");
    }

    console.log("[generate-avatar] Successfully generated avatar");

    const base64Data = imagePart.inlineData!.data;
    const mimeType = imagePart.inlineData!.mimeType;

    const imageUrl = `data:${mimeType};base64,${base64Data}`;

    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("Avatar generation error:", error);

    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        return NextResponse.json(
          { error: "AI service configuration error" },
          { status: 503 }
        );
      }
      if (error.message.includes("quota") || error.message.includes("limit")) {
        return NextResponse.json(
          { error: "AI generation limit reached. Try again later." },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to generate avatar" },
      { status: 500 }
    );
  }
}
