import { NextResponse } from "next/server";
import {
  generateImage,
  refineImage,
  buildPrompt,
  PROMPT_TEMPLATES,
  type ImageContext,
} from "@/lib/ai/image-generator";

// Image generation can take 30-60s
export const maxDuration = 60;

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

    // Refinement mode - supports both URL and base64 input
    const hasImageSource = existingImageUrl || (imageBase64 && imageMimeType);
    if (hasImageSource && refinementPrompt) {
      imageUrl = await refineImage({
        context,
        existingImageUrl,
        refinementPrompt,
        entityId,
        imageBase64,
        imageMimeType,
      });
    } else {
      // New generation mode
      const prompt = customPrompt || buildPrompt(context, title, content);
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
