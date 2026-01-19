import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

const COVER_IMAGE_PROMPT = `Create an abstract, artistic cover image for a tech product blog post.

Style guidelines:
- Modern, clean, tech-forward aesthetic
- Purple and blue gradient background inspired by dalat.app branding
- Abstract geometric shapes or flowing lines
- Subtle tech elements (code-like patterns, network nodes, light particles)
- Atmospheric depth with soft glow effects
- NO text, NO lettering, NO words
- Landscape orientation (16:9 aspect ratio)
- Professional and polished feel

The image should feel:
- Innovative and forward-thinking
- Warm but professional
- Suitable for a product changelog or release notes
- Visually interesting but not distracting from text overlay`;

/**
 * Generate a cover image for a blog post using Gemini 2.0
 * Returns the public URL of the uploaded image
 */
export async function generateCoverImage(
  postSlug: string,
  customPrompt?: string
): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY not configured");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase service credentials not configured");
  }

  // Generate the image with Gemini 3 Pro Image (Nano Banana Pro)
  // Best quality model for artistic image generation with advanced reasoning
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-3-pro-image-preview",
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    } as never, // Type workaround
  });

  const prompt = customPrompt || COVER_IMAGE_PROMPT;
  console.log("[cover-generator] Generating cover for:", postSlug);

  const result = await model.generateContent(prompt);
  const response = result.response;

  // Extract the image from the response
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) {
    console.error("[cover-generator] No parts in response");
    throw new Error("No response from AI model");
  }

  const imagePart = parts.find(
    (part) => "inlineData" in part && part.inlineData?.mimeType?.startsWith("image/")
  );

  if (!imagePart || !("inlineData" in imagePart)) {
    console.error("[cover-generator] No image part found");
    throw new Error("No image generated");
  }

  const base64Data = imagePart.inlineData!.data;
  const mimeType = imagePart.inlineData!.mimeType;
  const ext = mimeType.split("/")[1] || "png";

  // Convert base64 to buffer
  const buffer = Buffer.from(base64Data, "base64");

  // Upload to Supabase storage
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const fileName = `covers/${postSlug}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("blog-media")
    .upload(fileName, buffer, {
      contentType: mimeType,
      cacheControl: "31536000", // 1 year cache
      upsert: false,
    });

  if (uploadError) {
    console.error("[cover-generator] Upload error:", uploadError);
    throw new Error(`Failed to upload cover image: ${uploadError.message}`);
  }

  // Get the public URL
  const { data: { publicUrl } } = supabase.storage
    .from("blog-media")
    .getPublicUrl(fileName);

  console.log("[cover-generator] Generated cover:", publicUrl);
  return publicUrl;
}

/**
 * Generate a cover image from AI-suggested descriptions
 * Uses the first description that works
 */
export async function generateCoverFromDescriptions(
  postSlug: string,
  descriptions: string[]
): Promise<string | null> {
  if (!descriptions.length) {
    return null;
  }

  // Try each description until one works
  for (const description of descriptions) {
    try {
      const enhancedPrompt = `${description}

Additional requirements:
- NO text, NO lettering, NO words in the image
- Landscape orientation (16:9)
- High quality, professional look
- Suitable as a blog post cover image`;

      return await generateCoverImage(postSlug, enhancedPrompt);
    } catch (error) {
      console.warn(
        `[cover-generator] Failed with description "${description.slice(0, 50)}...":`,
        error
      );
      continue;
    }
  }

  // If all descriptions fail, use default prompt
  try {
    return await generateCoverImage(postSlug);
  } catch {
    console.error("[cover-generator] Failed with default prompt too");
    return null;
  }
}
