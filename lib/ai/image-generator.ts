import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { extractPersonaMentions, fetchPersonaImages, hasPersonaMentions } from "./personas";

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

  "venue-logo": (name: string) => `Create a minimal, modern logo design for "${name || "a venue"}".

Style: Clean, geometric, hospitality brand identity
Colors: Warm, inviting palette that works on light and dark backgrounds
Important:
- Square format (1:1 aspect ratio)
- Simple, recognizable shape suggesting hospitality/gathering
- NO text or venue name
- Abstract/symbolic representation
- Suitable for small display sizes`,

  "venue-cover": (name: string) => `Create an atmospheric cover image for "${name || "a venue"}".

Style: Modern interior/exterior photography aesthetic, warm and inviting
Setting: A beautiful venue space - could be cafe, restaurant, bar, or event space
Mood: Welcoming, sophisticated, cozy yet professional
Elements: Soft lighting, ambient atmosphere, hint of Vietnamese highland charm
Important:
- Do NOT include any text or lettering
- Landscape orientation (2:1 aspect ratio)
- Focus on atmosphere and ambiance, not specific people
- Professional and polished feel`,
} as const;

export type ImageContext = keyof typeof PROMPT_TEMPLATES;

// Storage bucket mapping
export const STORAGE_BUCKETS: Record<ImageContext, string> = {
  "event-cover": "event-media",
  "blog-cover": "blog-media",
  avatar: "avatars",
  "organizer-logo": "organizer-logos",
  "venue-logo": "venue-media",
  "venue-cover": "venue-media",
};

// Storage folder prefixes
export const STORAGE_FOLDERS: Record<ImageContext, string> = {
  "event-cover": "",
  "blog-cover": "covers",
  avatar: "",
  "organizer-logo": "",
  "venue-logo": "logos",
  "venue-cover": "covers",
};

interface GenerateOptions {
  context: ImageContext;
  prompt: string;
  entityId?: string;
}

/**
 * Image metadata for SEO/AEO/GEO
 */
export interface ImageMetadata {
  /** Short alt text for accessibility (50-125 chars) */
  alt: string;
  /** Longer description for AI search engines */
  description: string;
  /** Keywords describing the image */
  keywords: string[];
  /** Dominant colors as hex codes */
  colors: string[];
  /** Semantic filename (without extension) */
  semanticFilename: string;
}

/**
 * Result of generating an image with metadata
 */
export interface ImageGenerationResult {
  url: string;
  metadata: ImageMetadata;
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
 * Analyze an image and extract metadata for SEO/AEO/GEO
 */
async function analyzeImageMetadata(
  base64Data: string,
  mimeType: string,
  context: ImageContext
): Promise<ImageMetadata> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY not configured");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // Use a text model for analysis (faster and cheaper)
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `Analyze this ${context.replace("-", " ")} image and provide metadata in JSON format.

Return ONLY valid JSON with this exact structure:
{
  "alt": "Short alt text for accessibility, 50-125 characters describing the image for screen readers",
  "description": "Detailed 1-2 sentence description of what the image shows, for AI search engines",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "colors": ["#hex1", "#hex2", "#hex3"],
  "semanticFilename": "lowercase-hyphenated-descriptive-filename-without-extension"
}

Guidelines:
- alt: Be concise but descriptive. Focus on what's visible, not interpretation.
- description: More detailed than alt. Good for AI search engines to understand context.
- keywords: 5-8 relevant keywords that describe the image content and style.
- colors: 3-5 dominant hex color codes from the image.
- semanticFilename: A SEO-friendly filename. Use lowercase, hyphens, no special chars. Should describe the visual content. Max 60 chars.`;

  try {
    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64Data } },
      prompt,
    ]);

    const text = result.response.text();
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = jsonMatch[1]?.trim() || text.trim();

    const metadata = JSON.parse(jsonStr) as ImageMetadata;

    // Validate and sanitize the filename
    metadata.semanticFilename = metadata.semanticFilename
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);

    return metadata;
  } catch (error) {
    console.error("[image-generator] Metadata extraction failed:", error);
    // Return fallback metadata
    return {
      alt: `${context.replace("-", " ")} image`,
      description: `An AI-generated ${context.replace("-", " ")} image`,
      keywords: [context.replace("-", " "), "ai-generated", "digital-art"],
      colors: ["#8B5CF6", "#3B82F6"], // dalat.app brand colors
      semanticFilename: `${context}-${Date.now()}`,
    };
  }
}

/**
 * Upload image to Supabase storage with semantic filename
 */
async function uploadImage(
  base64Data: string,
  mimeType: string,
  context: ImageContext,
  entityId?: string,
  semanticFilename?: string
): Promise<string> {
  const { client: supabase } = getSupabase();
  const bucket = STORAGE_BUCKETS[context];
  const folder = STORAGE_FOLDERS[context];
  const ext = mimeType.split("/")[1] || "png";

  // Build file path with semantic filename
  const filename = semanticFilename
    ? `${semanticFilename}-${Date.now().toString(36)}.${ext}`
    : `${Date.now()}.${ext}`;
  const parts = [folder, entityId, filename].filter(Boolean);
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

  const model = getModel();

  // Check for @persona mentions (or profile avatars) and include reference images
  if (await hasPersonaMentions(prompt)) {
    const { matches, cleanedPrompt } = await extractPersonaMentions(prompt);
    const personaImages = await fetchPersonaImages(matches);

    if (personaImages.length > 0) {
      // Build content array with reference images
      const contentParts: Array<{ inlineData: { mimeType: string; data: string } } | string> = [];

      // Add reference images with labels
      for (const { persona, images } of personaImages) {
        for (const img of images) {
          contentParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
        }
        contentParts.push(`The above ${images.length === 1 ? "image is a reference photo" : "images are reference photos"} of ${persona.name}. Use ${images.length === 1 ? "this" : "these"} as visual reference to accurately depict ${persona.name} in the generated image.`);
      }

      // Add the actual generation prompt
      const styleHints = personaImages
        .map(({ persona }) => persona.style)
        .filter(Boolean)
        .join(", ");
      const styleInstruction = styleHints ? `\n\nStyle hint for people: ${styleHints}` : "";

      contentParts.push(`\nNow generate the following image:\n\n${cleanedPrompt}${styleInstruction}`);

      console.log(`[image-generator] Including ${personaImages.reduce((sum, p) => sum + p.images.length, 0)} reference images for ${personaImages.map((p) => p.persona.name).join(", ")}`);

      const result = await model.generateContent(contentParts);
      const { data, mimeType } = extractImage(result);
      const publicUrl = await uploadImage(data, mimeType, context, entityId);

      console.log(`[image-generator] Generated ${context} with personas:`, publicUrl);
      return publicUrl;
    }
  }

  // No personas - standard generation
  const result = await model.generateContent(prompt);
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

  // Build prompt - allow text if user explicitly requests it
  const allowText = wantsText(refinementPrompt);
  const textRestriction = allowText
    ? "- You may add text as requested by the user"
    : "- NO text, NO lettering, NO words";

  const model = getModel();

  // Check for @persona mentions (or profile avatars) and include reference images
  if (await hasPersonaMentions(refinementPrompt)) {
    const { matches, cleanedPrompt } = await extractPersonaMentions(refinementPrompt);
    const personaImages = await fetchPersonaImages(matches);

    if (personaImages.length > 0) {
      // Build content array: existing image + reference images + prompt
      const contentParts: Array<{ inlineData: { mimeType: string; data: string } } | string> = [];

      // Add the existing image first
      contentParts.push({ inlineData: { mimeType, data: base64Image } });
      contentParts.push("This is the existing image to edit.");

      // Add reference images for each persona
      for (const { persona, images } of personaImages) {
        for (const img of images) {
          contentParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
        }
        contentParts.push(`The above ${images.length === 1 ? "image is a reference photo" : "images are reference photos"} of ${persona.name}. Use ${images.length === 1 ? "this" : "these"} as visual reference when adding ${persona.name} to the image.`);
      }

      // Add the refinement prompt
      const styleHints = personaImages
        .map(({ persona }) => persona.style)
        .filter(Boolean)
        .join(", ");
      const styleInstruction = styleHints ? `\n- When depicting people, use: ${styleHints}` : "";

      contentParts.push(`\nEdit the first image based on these instructions:

${cleanedPrompt}

Important:
- Keep the overall style and color palette consistent
${textRestriction}${styleInstruction}
- Keep it professional and polished`);

      console.log(`[image-generator] Refining with ${personaImages.reduce((sum, p) => sum + p.images.length, 0)} reference images for ${personaImages.map((p) => p.persona.name).join(", ")}`);

      const result = await model.generateContent(contentParts);
      const { data, mimeType: newMimeType } = extractImage(result);
      const publicUrl = await uploadImage(data, newMimeType, context, entityId);

      console.log(`[image-generator] Refined ${context} with personas:`, publicUrl);
      return publicUrl;
    }
  }

  // No personas - standard refinement
  const prompt = `Edit this image based on the following instructions:

${refinementPrompt}

Important:
- Keep the overall style and color palette consistent
${textRestriction}
- Keep it professional and polished`;

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

/**
 * Generate a new image with AI and extract SEO metadata
 * Returns both the URL and comprehensive metadata for SEO/AEO/GEO
 */
export async function generateImageWithMetadata(
  options: GenerateOptions
): Promise<ImageGenerationResult> {
  const { context, prompt, entityId } = options;

  console.log(`[image-generator] Generating ${context} image with metadata`);

  const model = getModel();
  let imageData: string;
  let imageMimeType: string;

  // Check for @persona mentions and include reference images
  if (await hasPersonaMentions(prompt)) {
    const { matches, cleanedPrompt } = await extractPersonaMentions(prompt);
    const personaImages = await fetchPersonaImages(matches);

    if (personaImages.length > 0) {
      const contentParts: Array<{ inlineData: { mimeType: string; data: string } } | string> = [];

      for (const { persona, images } of personaImages) {
        for (const img of images) {
          contentParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
        }
        contentParts.push(
          `The above ${images.length === 1 ? "image is a reference photo" : "images are reference photos"} of ${persona.name}. Use ${images.length === 1 ? "this" : "these"} as visual reference.`
        );
      }

      const styleHints = personaImages
        .map(({ persona }) => persona.style)
        .filter(Boolean)
        .join(", ");
      const styleInstruction = styleHints ? `\n\nStyle hint: ${styleHints}` : "";
      contentParts.push(`\nGenerate:\n\n${cleanedPrompt}${styleInstruction}`);

      const result = await model.generateContent(contentParts);
      const extracted = extractImage(result);
      imageData = extracted.data;
      imageMimeType = extracted.mimeType;
    } else {
      const result = await model.generateContent(prompt);
      const extracted = extractImage(result);
      imageData = extracted.data;
      imageMimeType = extracted.mimeType;
    }
  } else {
    const result = await model.generateContent(prompt);
    const extracted = extractImage(result);
    imageData = extracted.data;
    imageMimeType = extracted.mimeType;
  }

  // Analyze the generated image to extract metadata
  console.log(`[image-generator] Extracting metadata from generated image`);
  const metadata = await analyzeImageMetadata(imageData, imageMimeType, context);

  // Upload with semantic filename
  const publicUrl = await uploadImage(
    imageData,
    imageMimeType,
    context,
    entityId,
    metadata.semanticFilename
  );

  console.log(`[image-generator] Generated ${context} with metadata:`, {
    url: publicUrl,
    alt: metadata.alt,
    filename: metadata.semanticFilename,
  });

  return { url: publicUrl, metadata };
}

/**
 * Refine an existing image and extract updated SEO metadata
 */
export async function refineImageWithMetadata(
  options: RefineOptions
): Promise<ImageGenerationResult> {
  const { context, existingImageUrl, refinementPrompt, entityId, imageBase64, imageMimeType } =
    options;

  console.log(`[image-generator] Refining ${context} image with metadata`);

  let base64Image: string;
  let mimeType: string;

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

  const allowText = wantsText(refinementPrompt);
  const textRestriction = allowText
    ? "- You may add text as requested"
    : "- NO text, NO lettering, NO words";

  const model = getModel();
  let newImageData: string;
  let newMimeType: string;

  if (await hasPersonaMentions(refinementPrompt)) {
    const { matches, cleanedPrompt } = await extractPersonaMentions(refinementPrompt);
    const personaImages = await fetchPersonaImages(matches);

    if (personaImages.length > 0) {
      const contentParts: Array<{ inlineData: { mimeType: string; data: string } } | string> = [];
      contentParts.push({ inlineData: { mimeType, data: base64Image } });
      contentParts.push("This is the existing image to edit.");

      for (const { persona, images } of personaImages) {
        for (const img of images) {
          contentParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
        }
        contentParts.push(
          `Reference ${images.length === 1 ? "photo" : "photos"} of ${persona.name}.`
        );
      }

      const styleHints = personaImages
        .map(({ persona }) => persona.style)
        .filter(Boolean)
        .join(", ");
      const styleInstruction = styleHints ? `\n- Style: ${styleHints}` : "";

      contentParts.push(`\nEdit instructions:\n${cleanedPrompt}\n\nRules:\n- Keep style consistent\n${textRestriction}${styleInstruction}`);

      const result = await model.generateContent(contentParts);
      const extracted = extractImage(result);
      newImageData = extracted.data;
      newMimeType = extracted.mimeType;
    } else {
      const result = await model.generateContent([
        { inlineData: { mimeType, data: base64Image } },
        `Edit:\n${refinementPrompt}\n\nRules:\n- Keep style consistent\n${textRestriction}`,
      ]);
      const extracted = extractImage(result);
      newImageData = extracted.data;
      newMimeType = extracted.mimeType;
    }
  } else {
    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64Image } },
      `Edit:\n${refinementPrompt}\n\nRules:\n- Keep style consistent\n${textRestriction}`,
    ]);
    const extracted = extractImage(result);
    newImageData = extracted.data;
    newMimeType = extracted.mimeType;
  }

  // Analyze the refined image
  console.log(`[image-generator] Extracting metadata from refined image`);
  const metadata = await analyzeImageMetadata(newImageData, newMimeType, context);

  // Upload with semantic filename
  const publicUrl = await uploadImage(
    newImageData,
    newMimeType,
    context,
    entityId,
    metadata.semanticFilename
  );

  console.log(`[image-generator] Refined ${context} with metadata:`, {
    url: publicUrl,
    alt: metadata.alt,
    filename: metadata.semanticFilename,
  });

  return { url: publicUrl, metadata };
}
