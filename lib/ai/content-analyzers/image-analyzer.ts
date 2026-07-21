/**
 * Image caption contract for the keyless captioning pipeline.
 *
 * Inference no longer happens on this server: the cron enqueues caption_jobs
 * (prompt included in the row), the Mac mini worker runs the vision model
 * (subscription `claude -p` or local VLM — no pay-per-token API keys), and the
 * /api/admin/caption-jobs/complete route validates the model's raw JSON with
 * normalizeImageAnalysis() before anything reaches moment_metadata.
 *
 * The schema is deliberately slim: only fields with real consumers (SEO alt
 * text, keywords, the AI-insights panel). quality_score is intentionally NOT
 * produced — machine-written scores would reshuffle the homepage moments-strip
 * ORDER BY (COALESCE(quality_score, 0.5) handles absent values).
 */

export interface ImageAnalysis {
  ai_description: string;
  ai_title: string;
  ai_tags: string[];
  scene_description: string;
  mood: string;
  detected_objects: string[];
  content_language: string;
}

/** Bump when the prompt changes — jobs carry it, so re-runs are a WHERE clause. */
export const IMAGE_PROMPT_VERSION = "v2-slim";

export const IMAGE_ANALYSIS_PROMPT = `Analyze this image from an event in Đà Lạt, Vietnam. Extract metadata for SEO and search.

PRIVACY RULES (mandatory):
- Describe the SCENE only. Never identify, name, or describe individual people's appearance, clothing, or distinguishing features. "A group of friends laughing over board games" is fine; "a woman in a red dress" is not.
- Location references stay at neighborhood level or broader (e.g. "a cozy cafe in Đà Lạt", "a pine-forested hillside"). Never guess a specific address, street number, or whose home a place might be.
- Do not transcribe text that reveals personal information (names, phone numbers, addresses).

Return a JSON object with these exact fields:
{
  "ai_description": "2-3 sentence SEO description of what's in the image, suitable for meta description",
  "ai_title": "Short catchy title (5-10 words) for the image",
  "ai_tags": ["array", "of", "relevant", "keywords", "max 10"],
  "scene_description": "Detailed description of the scene, setting, and what's happening",
  "mood": "one word: festive, calm, energetic, intimate, joyful, dramatic, peaceful, vibrant, cozy, or nostalgic",
  "detected_objects": ["array of objects visible: stage, crowd, lights, etc."],
  "content_language": "detected language of any public text, or 'en' if none"
}

Be specific and descriptive — generic captions ("people at an event") are useless for search. Focus on Đà Lạt/Vietnamese cultural context when relevant.
Output ONLY the JSON object, no other text.`;

/**
 * Turn untrusted model output into a safe, typed analysis.
 * Throws when the load-bearing field (ai_description) is missing.
 */
export function normalizeImageAnalysis(raw: unknown): ImageAnalysis {
  const result = (raw ?? {}) as Record<string, unknown>;
  const description = String(result.ai_description || "").trim();
  if (!description) {
    throw new Error("Model output missing ai_description");
  }
  return {
    ai_description: description,
    ai_title: String(result.ai_title || "").trim(),
    ai_tags: Array.isArray(result.ai_tags)
      ? result.ai_tags.slice(0, 10).map(String)
      : [],
    scene_description: String(result.scene_description || "").trim(),
    mood: String(result.mood || "neutral"),
    detected_objects: Array.isArray(result.detected_objects)
      ? result.detected_objects.slice(0, 20).map(String)
      : [],
    content_language: String(result.content_language || "en"),
  };
}
