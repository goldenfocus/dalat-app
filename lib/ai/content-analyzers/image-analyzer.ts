import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface ImageAnalysis {
  ai_description: string;
  ai_title: string;
  ai_tags: string[];
  scene_description: string;
  mood: string;
  quality_score: number;
  detected_objects: string[];
  detected_text: string[];
  detected_faces_count: number;
  dominant_colors: string[];
  location_hints: string[];
  content_language: string;
}

const IMAGE_ANALYSIS_PROMPT = `Analyze this image from an event in Đà Lạt, Vietnam. Extract detailed metadata for SEO and search.

Return a JSON object with these exact fields:
{
  "ai_description": "2-3 sentence SEO description of what's in the image, suitable for meta description",
  "ai_title": "Short catchy title (5-10 words) for the image",
  "ai_tags": ["array", "of", "relevant", "keywords", "max 10"],
  "scene_description": "Detailed description of the scene, setting, and what's happening",
  "mood": "one word: festive, calm, energetic, intimate, joyful, dramatic, peaceful, vibrant, cozy, or nostalgic",
  "quality_score": 0.0-1.0 (how visually appealing/shareable the image is),
  "detected_objects": ["array of objects visible: stage, crowd, lights, etc."],
  "detected_text": ["any text visible in the image (signs, banners, etc.)"],
  "detected_faces_count": number of faces visible (0 if none),
  "dominant_colors": ["#hex", "#colors", "up to 5"],
  "location_hints": ["clues about location: outdoor, cafe, street, etc."],
  "content_language": "detected language of any text, or 'en' if none"
}

Be specific and descriptive. Focus on Đà Lạt/Vietnamese cultural context when relevant.
Output ONLY the JSON object, no other text.`;

/**
 * Analyze an image using Claude Vision to extract metadata for SEO.
 * Uses claude-sonnet-4 for vision capabilities.
 */
export async function analyzeImage(imageUrl: string): Promise<ImageAnalysis> {
  const startTime = Date.now();

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "url",
                url: imageUrl,
              },
            },
            {
              type: "text",
              text: IMAGE_ANALYSIS_PROMPT,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Failed to parse image analysis response:", text);
      throw new Error("Could not parse AI response");
    }

    const result = JSON.parse(jsonMatch[0]);

    // Validate and normalize the result
    return {
      ai_description: String(result.ai_description || ""),
      ai_title: String(result.ai_title || ""),
      ai_tags: Array.isArray(result.ai_tags)
        ? result.ai_tags.slice(0, 10).map(String)
        : [],
      scene_description: String(result.scene_description || ""),
      mood: String(result.mood || "neutral"),
      quality_score: typeof result.quality_score === "number"
        ? Math.min(1, Math.max(0, result.quality_score))
        : 0.5,
      detected_objects: Array.isArray(result.detected_objects)
        ? result.detected_objects.map(String)
        : [],
      detected_text: Array.isArray(result.detected_text)
        ? result.detected_text.map(String)
        : [],
      detected_faces_count: typeof result.detected_faces_count === "number"
        ? Math.max(0, Math.floor(result.detected_faces_count))
        : 0,
      dominant_colors: Array.isArray(result.dominant_colors)
        ? result.dominant_colors.slice(0, 5).map(String)
        : [],
      location_hints: Array.isArray(result.location_hints)
        ? result.location_hints.map(String)
        : [],
      content_language: String(result.content_language || "en"),
    };
  } catch (error) {
    console.error("Error analyzing image:", error);
    throw error;
  }
}

/**
 * Analyze multiple images in batch (sequential to avoid rate limits).
 */
export async function analyzeImagesBatch(
  imageUrls: string[]
): Promise<Map<string, ImageAnalysis | Error>> {
  const results = new Map<string, ImageAnalysis | Error>();

  for (const url of imageUrls) {
    try {
      const analysis = await analyzeImage(url);
      results.set(url, analysis);
      // Small delay between requests to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      results.set(url, error instanceof Error ? error : new Error(String(error)));
    }
  }

  return results;
}
