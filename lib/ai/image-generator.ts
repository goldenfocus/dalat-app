import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { expandPersonaMentions } from "./personas";

// Gemini model for image generation
const MODEL_NAME = "gemini-3-pro-image-preview";

// Context-specific prompt templates
export const PROMPT_TEMPLATES = {
  "event-cover": (title: string) => `Create a vibrant, eye-catching event poster background for "${title}".

Style: Modern event flyer aesthetic with warm Vietnamese highland colors.
Setting: Inspired by Đà Lạt, Vietnam - misty mountains, pine forests, French colonial architecture, flower fields.
Mood: Atmospheric, inviting, energetic yet sophisticated.
Important: Do NOT include any text or lettering in the image. Create only the visual background.
Aspect ratio: 2:1 landscape orientation.`,

  "blog-cover": (title: string, content?: string) => `Create an abstract, artistic cover image for a blog post about: ${title}

Context: ${content?.slice(0, 200) || "A blog post about technology and community events"}

Style guidelines:
- Modern, clean, tech-forward aesthetic
- Purple and blue gradient background inspired by dalat.app branding
- Abstract geometric shapes or flowing lines relevant to the topic
- Subtle visual elements that hint at the subject matter
- Atmospheric depth with soft glow effects
- NO text, NO lettering, NO words
- Landscape orientation (16:9 aspect ratio)
- Professional and polished feel`,

  avatar: (description: string) => `Create a stylized, artistic avatar portrait.

Subject: ${description || "A friendly, approachable person"}
Style: Modern digital art, clean lines, vibrant but sophisticated colors
Mood: Warm, professional, approachable
Important:
- Square format (1:1 aspect ratio)
- NO text or lettering
- Suitable for a profile picture
- Abstract or illustrated style, not photorealistic`,

  "organizer-logo": (name: string) => `Create a minimal, modern logo design for "${name || "an event organizer"}".

Style: Clean, geometric, modern brand identity
Colors: Professional palette, works on light and dark backgrounds
Important:
- Square format (1:1 aspect ratio)
- Simple, recognizable shape
- NO text or company name
- Abstract/symbolic representation
- Suitable for small display sizes`,
} as const;

export type ImageContext = keyof typeof PROMPT_TEMPLATES;

// Storage bucket mapping
export const STORAGE_BUCKETS: Record<ImageContext, string> = {
  "event-cover": "event-media",
  "blog-cover": "blog-media",
  avatar: "avatars",
  "organizer-logo": "organizer-logos",
};

// Storage folder prefixes
export const STORAGE_FOLDERS: Record<ImageContext, string> = {
  "event-cover": "",
  "blog-cover": "covers",
  avatar: "",
  "organizer-logo": "",
};

interface GenerateOptions {
  context: ImageContext;
  prompt: string;
  entityId?: string;
}

interface RefineOptions {
  context: ImageContext;
  existingImageUrl?: string;
  refinementPrompt: string;
  entityId?: string;
  /** Base64-encoded image data (alternative to existingImageUrl) */
  imageBase64?: string;
  /** MIME type when using imageBase64 */
  imageMimeType?: string;
}

/**
 * Get configured Gemini model for image generation
 */
function getModel() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY not configured");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    } as never,
  });
}

/**
 * Get configured Supabase client with service role
 */
function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase service credentials not configured");
  }

  return { client: createClient(supabaseUrl, supabaseServiceKey), url: supabaseUrl };
}

/**
 * Extract image from Gemini response
 */
function extractImage(
  result: { response: { candidates?: Array<{ content?: { parts?: Array<unknown> } }> } }
): { data: string; mimeType: string } {
  const parts = result.response.candidates?.[0]?.content?.parts;
  if (!parts) {
    throw new Error("No response from AI model");
  }

  const imagePart = parts.find(
    (part) =>
      typeof part === "object" &&
      part !== null &&
      "inlineData" in part &&
      (part as { inlineData?: { mimeType?: string } }).inlineData?.mimeType?.startsWith("image/")
  ) as { inlineData: { data: string; mimeType: string } } | undefined;

  if (!imagePart) {
    throw new Error("No image generated");
  }

  return {
    data: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
  };
}

/**
 * Upload image to Supabase storage
 */
async function uploadImage(
  base64Data: string,
  mimeType: string,
  context: ImageContext,
  entityId?: string
): Promise<string> {
  const { client: supabase } = getSupabase();
  const bucket = STORAGE_BUCKETS[context];
  const folder = STORAGE_FOLDERS[context];
  const ext = mimeType.split("/")[1] || "png";

  // Build file path
  const parts = [folder, entityId, `${Date.now()}.${ext}`].filter(Boolean);
  const fileName = parts.join("/");

  const buffer = Buffer.from(base64Data, "base64");

  const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, buffer, {
    contentType: mimeType,
    cacheControl: "31536000",
    upsert: false,
  });

  if (uploadError) {
    throw new Error(`Failed to upload: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(fileName);

  return publicUrl;
}

/**
 * Generate a new image with AI
 */
export async function generateImage(options: GenerateOptions): Promise<string> {
  const { context, prompt, entityId } = options;

  console.log(`[image-generator] Generating ${context} image`);

  // Expand any @persona mentions into full descriptions
  const expandedPrompt = expandPersonaMentions(prompt);

  const model = getModel();
  const result = await model.generateContent(expandedPrompt);
  const { data, mimeType } = extractImage(result);

  const publicUrl = await uploadImage(data, mimeType, context, entityId);
  console.log(`[image-generator] Generated ${context}:`, publicUrl);

  return publicUrl;
}

/**
 * Check if the refinement prompt explicitly requests text/lettering
 */
function wantsText(prompt: string): boolean {
  const textPatterns = [
    /add\s+(.*?\s+)?text/i,
    /add\s+(.*?\s+)?title/i,
    /write\s/i,
    /lettering/i,
    /caption/i,
    /overlay\s+(.*?\s+)?text/i,
    /put\s+(.*?\s+)?text/i,
    /include\s+(.*?\s+)?text/i,
  ];
  return textPatterns.some((pattern) => pattern.test(prompt));
}

/**
 * Refine an existing image with AI
 */
export async function refineImage(options: RefineOptions): Promise<string> {
  const { context, existingImageUrl, refinementPrompt, entityId, imageBase64, imageMimeType } = options;

  console.log(`[image-generator] Refining ${context} image`);

  let base64Image: string;
  let mimeType: string;

  // Use provided base64 data or fetch from URL
  if (imageBase64 && imageMimeType) {
    base64Image = imageBase64;
    mimeType = imageMimeType;
  } else if (existingImageUrl) {
    const imageResponse = await fetch(existingImageUrl);
    if (!imageResponse.ok) {
      throw new Error("Failed to fetch existing image");
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    base64Image = Buffer.from(imageBuffer).toString("base64");
    mimeType = imageResponse.headers.get("content-type") || "image/png";
  } else {
    throw new Error("Either imageBase64 or existingImageUrl must be provided");
  }

  // Expand any @persona mentions into full descriptions
  const expandedRefinement = expandPersonaMentions(refinementPrompt);

  // Build prompt - allow text if user explicitly requests it
  const allowText = wantsText(refinementPrompt);
  const textRestriction = allowText
    ? "- You may add text as requested by the user"
    : "- NO text, NO lettering, NO words";

  const prompt = `Edit this image based on the following instructions:

${expandedRefinement}

Important:
- Keep the overall style and color palette consistent
${textRestriction}
- Keep it professional and polished`;

  const model = getModel();
  const result = await model.generateContent([
    { inlineData: { mimeType, data: base64Image } },
    prompt,
  ]);

  const { data, mimeType: newMimeType } = extractImage(result);
  const publicUrl = await uploadImage(data, newMimeType, context, entityId);

  console.log(`[image-generator] Refined ${context}:`, publicUrl);
  return publicUrl;
}

/**
 * Build a prompt using the template for a given context
 */
export function buildPrompt(
  context: ImageContext,
  title: string,
  content?: string
): string {
  const template = PROMPT_TEMPLATES[context];
  if (context === "blog-cover") {
    return (template as (t: string, c?: string) => string)(title, content);
  }
  return (template as (t: string) => string)(title);
}
