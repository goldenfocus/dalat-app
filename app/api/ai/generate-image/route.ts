import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  generateImageWithMetadata,
  refineImageWithMetadata,
  buildPrompt,
  PROMPT_TEMPLATES,
  type ImageContext,
  type ImageMetadata,
} from "@/lib/ai/image-generator";
import { saveImageVersion } from "@/lib/image-versions";
import { triggerTranslationServer } from "@/lib/translations";
import type { ImageVersionContentType, ImageVersionFieldName, TranslationContentType } from "@/lib/types";

// Image generation can take 60-120s (refinement involves: fetch, generate, metadata extraction, upload)
export const maxDuration = 120;

// Rate limiting config
const RATE_LIMIT = 10; // requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Map ImageContext to version tracking types
 */
function getVersionTypes(context: ImageContext): {
  contentType: ImageVersionContentType;
  fieldName: ImageVersionFieldName;
} {
  switch (context) {
    case "event-cover":
      return { contentType: "event", fieldName: "cover_image" };
    case "blog-cover":
      return { contentType: "blog", fieldName: "cover_image" };
    case "avatar":
      return { contentType: "profile", fieldName: "avatar" };
    case "organizer-logo":
      return { contentType: "organizer", fieldName: "logo" };
    case "venue-logo":
      return { contentType: "venue", fieldName: "logo" };
    case "venue-cover":
      return { contentType: "venue", fieldName: "cover_image" };
    default:
      return { contentType: "event", fieldName: "cover_image" };
  }
}

/**
 * Get Supabase admin client for updating parent tables
 */
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials not configured");
  return createAdminClient(url, key);
}

/**
 * Save image metadata to the parent content table and trigger translations.
 * This makes metadata discoverable by search engines.
 */
async function saveMetadataToParent(
  context: ImageContext,
  entityId: string,
  imageUrl: string,
  metadata: ImageMetadata
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { contentType } = getVersionTypes(context);

  // Map context to table and column names
  const tableConfig: Record<string, { table: string; urlCol: string; altCol: string | null; descCol: string | null; keywordsCol: string | null; colorsCol: string | null }> = {
    "event-cover": { table: "events", urlCol: "image_url", altCol: "image_alt", descCol: "image_description", keywordsCol: "image_keywords", colorsCol: "image_colors" },
    "blog-cover": { table: "blog_posts", urlCol: "cover_image_url", altCol: "cover_image_alt", descCol: "cover_image_description", keywordsCol: "cover_image_keywords", colorsCol: "cover_image_colors" },
    "venue-cover": { table: "venues", urlCol: "cover_photo_url", altCol: "cover_image_alt", descCol: "cover_image_description", keywordsCol: "cover_image_keywords", colorsCol: "cover_image_colors" },
    "venue-logo": { table: "venues", urlCol: "logo_url", altCol: "logo_alt", descCol: "logo_description", keywordsCol: null, colorsCol: null },
    "organizer-logo": { table: "organizers", urlCol: "logo_url", altCol: "logo_alt", descCol: "logo_description", keywordsCol: null, colorsCol: null },
    "avatar": { table: "profiles", urlCol: "avatar_url", altCol: null, descCol: null, keywordsCol: null, colorsCol: null },
  };

  const config = tableConfig[context];
  if (!config) return;

  // Build update object with only non-null columns
  const updateData: Record<string, unknown> = {
    [config.urlCol]: imageUrl,
  };
  if (config.altCol) updateData[config.altCol] = metadata.alt;
  if (config.descCol) updateData[config.descCol] = metadata.description;
  if (config.keywordsCol) updateData[config.keywordsCol] = metadata.keywords;
  if (config.colorsCol) updateData[config.colorsCol] = metadata.colors;

  const { error } = await supabase
    .from(config.table)
    .update(updateData)
    .eq("id", entityId);

  if (error) {
    console.error(`[generate-image] Failed to save metadata to ${config.table}:`, error);
    return;
  }

  // Trigger translation for image metadata (fire-and-forget)
  // This translates alt text and description to all 12 languages
  const translationFields: { field_name: "image_alt" | "image_description"; text: string }[] = [];
  if (metadata.alt) {
    translationFields.push({ field_name: "image_alt", text: metadata.alt });
  }
  if (metadata.description) {
    translationFields.push({ field_name: "image_description", text: metadata.description });
  }

  if (translationFields.length > 0) {
    triggerTranslationServer(contentType as TranslationContentType, entityId, translationFields).catch((err) => {
      console.error("[generate-image] Translation failed:", err);
    });
  }
}

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
    let metadata: ImageMetadata | undefined;
    let generationPrompt: string;

    // Sanitize user-provided prompts to prevent injection
    const sanitizedCustomPrompt = sanitizePrompt(customPrompt);
    const sanitizedRefinementPrompt = sanitizePrompt(refinementPrompt);

    // Refinement mode - supports both URL and base64 input
    const hasImageSource = existingImageUrl || (imageBase64 && imageMimeType);
    if (hasImageSource && sanitizedRefinementPrompt) {
      const result = await refineImageWithMetadata({
        context,
        existingImageUrl,
        refinementPrompt: sanitizedRefinementPrompt,
        entityId,
        imageBase64,
        imageMimeType,
      });
      imageUrl = result.url;
      metadata = result.metadata;
      generationPrompt = sanitizedRefinementPrompt;
    } else {
      // New generation mode - prefer template-based prompt over custom
      const prompt = sanitizedCustomPrompt || buildPrompt(context, title, content);
      const result = await generateImageWithMetadata({
        context,
        prompt,
        entityId,
      });
      imageUrl = result.url;
      metadata = result.metadata;
      generationPrompt = prompt;
    }

    // Save version to history and metadata to parent table if we have an entityId
    if (entityId && metadata) {
      const { contentType, fieldName } = getVersionTypes(context);

      // Save version history
      await saveImageVersion({
        contentType,
        contentId: entityId,
        fieldName,
        imageUrl,
        metadata: {
          alt: metadata.alt,
          description: metadata.description,
          keywords: metadata.keywords,
          colors: metadata.colors,
        },
        generationPrompt,
        createdBy: user.id,
      });

      // Save metadata to parent table and trigger translations (fire-and-forget)
      // This makes the image metadata SEO-discoverable in all 12 languages
      saveMetadataToParent(context, entityId, imageUrl, metadata).catch((err) => {
        console.error("[generate-image] Failed to save parent metadata:", err);
      });
    }

    return NextResponse.json({ imageUrl, metadata });
  } catch (error) {
    console.error("[api/ai/generate-image] Error:", error);

    if (error instanceof Error) {
      const msg = error.message.toLowerCase();

      // Quota/rate limit errors
      if (msg.includes("quota") || msg.includes("limit") || msg.includes("429")) {
        return NextResponse.json({ error: "AI generation limit reached. Try again later." }, { status: 429 });
      }

      // Configuration errors
      if (msg.includes("not configured")) {
        return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
      }

      // Content safety/policy errors from Google Gemini
      if (msg.includes("safety") || msg.includes("blocked") || msg.includes("prohibited") ||
          msg.includes("policy") || msg.includes("harm") || msg.includes("sexual") ||
          msg.includes("inappropriate") || msg.includes("content filter")) {
        return NextResponse.json(
          { error: "Your prompt was flagged by content safety filters. Try rephrasing without suggestive language." },
          { status: 400 }
        );
      }

      // Image fetch errors
      if (msg.includes("failed to fetch")) {
        return NextResponse.json({ error: "Could not load the image. Try uploading again." }, { status: 400 });
      }

      // No image generated (sometimes happens with borderline prompts)
      if (msg.includes("no image generated") || msg.includes("no response")) {
        return NextResponse.json(
          { error: "AI couldn't generate an image. Try rephrasing your prompt." },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Generation failed. Check server logs for details." },
      { status: 500 }
    );
  }
}
