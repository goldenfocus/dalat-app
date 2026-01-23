import {
  generateImage,
  refineImage,
  buildPrompt,
  generateImageWithMetadata,
  refineImageWithMetadata,
  type ImageGenerationResult,
  type ImageMetadata,
} from "@/lib/ai/image-generator";

export type { ImageGenerationResult, ImageMetadata };

/**
 * Generate a cover image for a blog post using Gemini
 * Returns the public URL of the uploaded image
 */
export async function generateCoverImage(postSlug: string, customPrompt?: string): Promise<string> {
  const prompt = customPrompt || buildPrompt("blog-cover", postSlug);

  return generateImage({
    context: "blog-cover",
    prompt,
    entityId: postSlug,
  });
}

/**
 * Generate a cover image with full SEO/AEO/GEO metadata
 * Returns both the URL and comprehensive metadata
 */
export async function generateCoverImageWithMetadata(
  postSlug: string,
  customPrompt?: string
): Promise<ImageGenerationResult> {
  const prompt = customPrompt || buildPrompt("blog-cover", postSlug);

  return generateImageWithMetadata({
    context: "blog-cover",
    prompt,
    entityId: postSlug,
  });
}

/**
 * Refine an existing cover image based on user feedback
 * Sends the current image + refinement instructions to Gemini
 */
export async function refineCoverImage(
  postSlug: string,
  existingImageUrl: string,
  refinementPrompt: string
): Promise<string> {
  return refineImage({
    context: "blog-cover",
    existingImageUrl,
    refinementPrompt,
    entityId: postSlug,
  });
}

/**
 * Refine an existing cover image and return updated metadata
 */
export async function refineCoverImageWithMetadata(
  postSlug: string,
  existingImageUrl: string,
  refinementPrompt: string
): Promise<ImageGenerationResult> {
  return refineImageWithMetadata({
    context: "blog-cover",
    existingImageUrl,
    refinementPrompt,
    entityId: postSlug,
  });
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
