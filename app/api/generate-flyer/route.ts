import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Gemini image generation can take 30-60s
export const maxDuration = 60;

const RATE_LIMIT = 5; // requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

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

    // Database-backed rate limiting
    const { data: rateCheck, error: rateError } = await supabase.rpc('check_rate_limit', {
      p_action: 'generate_flyer',
      p_limit: RATE_LIMIT,
      p_window_ms: RATE_WINDOW_MS,
    });

    if (rateError) {
      console.error("[generate-flyer] Rate limit check failed:", rateError);
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

    const { title, customPrompt } = await request.json();

    if (!title?.trim() && !customPrompt?.trim()) {
      return NextResponse.json(
        { error: "Event title or custom prompt is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI generation is not configured" },
        { status: 503 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Use Gemini 3 Pro for highest quality image generation
    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      } as never, // Type workaround - SDK types may not include responseModalities yet
    });

    // Use custom prompt if provided, otherwise generate default
    const prompt = customPrompt?.trim() || `Create a vibrant, eye-catching event poster background for "${title}".

Style: Modern event flyer aesthetic with warm Vietnamese highland colors.
Setting: Inspired by Đà Lạt, Vietnam - misty mountains, pine forests, French colonial architecture, flower fields.
Mood: Atmospheric, inviting, energetic yet sophisticated.
Important: Do NOT include any text or lettering in the image. Create only the visual background.
Aspect ratio: 2:1 landscape orientation.`;

    console.log("[generate-flyer] Calling Gemini with prompt:", prompt.slice(0, 100) + "...");

    const result = await model.generateContent(prompt);
    const response = result.response;

    // Debug: Log full response structure
    console.log("[generate-flyer] Response candidates:", JSON.stringify({
      candidatesCount: response.candidates?.length ?? 0,
      finishReason: response.candidates?.[0]?.finishReason,
      partsCount: response.candidates?.[0]?.content?.parts?.length ?? 0,
      partTypes: response.candidates?.[0]?.content?.parts?.map(p =>
        "inlineData" in p ? `inline:${p.inlineData?.mimeType}` :
        "text" in p ? "text" :
        Object.keys(p).join(",")
      ),
    }, null, 2));

    // Extract the image from the response
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) {
      console.error("[generate-flyer] No parts in response. Full response:", JSON.stringify(response, null, 2));
      throw new Error("No response from AI model");
    }

    // Find the image part in the response
    const imagePart = parts.find(
      (part) => "inlineData" in part && part.inlineData?.mimeType?.startsWith("image/")
    );

    if (!imagePart || !("inlineData" in imagePart)) {
      console.error("[generate-flyer] No image part found. Parts:", JSON.stringify(parts.map(p =>
        "inlineData" in p ? { type: "inlineData", mime: p.inlineData?.mimeType } :
        "text" in p ? { type: "text", preview: (p.text as string)?.slice(0, 100) } :
        { type: "unknown", keys: Object.keys(p) }
      ), null, 2));
      throw new Error("No image generated");
    }

    console.log("[generate-flyer] Successfully generated image:", imagePart.inlineData!.mimeType);

    const base64Data = imagePart.inlineData!.data;
    const mimeType = imagePart.inlineData!.mimeType;

    // Return as data URL for immediate preview
    const imageUrl = `data:${mimeType};base64,${base64Data}`;

    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("Flyer generation error:", error);

    // Handle specific API errors
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
      { error: "Failed to generate flyer image" },
      { status: 500 }
    );
  }
}
