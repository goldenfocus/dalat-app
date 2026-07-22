/**
 * Pure recap building blocks — NO SDK imports, NO network. The prompt runs
 * on the Mac mini via `claude -p` (caption_jobs content_type 'recap'), and
 * the raw output is parsed server-side in caption-jobs/complete.
 *
 * Privacy fence: selectRecapMoments only passes moments whose metadata
 * settled 'completed' — privacy-gated moments settle 'skipped' in
 * process-moments and never reach any AI prompt. detected_text is
 * deliberately absent from RecapMomentRow: it is OCR exhaust (name tags,
 * phone numbers) and must never enter recap prose.
 */

export const RECAP_PROMPT_VERSION = "recap-v2";

export interface RecapMomentRow {
  content_type: string;
  processing_status: string | null;
  ai_description: string | null;
  ai_title: string | null;
  scene_description: string | null;
  mood: string | null;
  detected_objects: string[] | null;
  ai_tags: string[] | null;
  video_summary: string | null;
  audio_summary: string | null;
}

export interface RecapPromptInput {
  event: {
    title: string;
    description: string | null;
    location_name: string | null;
    starts_at: string;
    ends_at: string | null;
    ai_tags: string[] | null;
  };
  moments: RecapMomentRow[];
  venueName: string | null;
  organizerName: string | null;
  momentCount: number;
  photoCount: number;
  videoCount: number;
}

export interface RecapOutput {
  story_content: string;
  meta_description: string;
  seo_keywords: string[];
  social_share_text: string;
  suggested_cta_text: string;
}

export function selectRecapMoments(rows: RecapMomentRow[]): RecapMomentRow[] {
  return rows.filter(
    (m) => m.processing_status === "completed" && !!m.ai_description?.trim()
  );
}

const RECAP_SYSTEM = `You are a storyteller for dalat.app, creating engaging recaps of events in Đà Lạt, Vietnam. Your readers are locals, expats, and travelers interested in what's happening in the city.

## Your Task
Given an event's details and AI-analyzed descriptions of photos/videos from the event, create a compelling recap that:
1. Makes people who weren't there wish they'd come
2. Showcases the authentic Đà Lạt experience
3. Is SEO-optimized for discoverability

## Output Format (JSON)
Return ONLY a valid JSON object, no markdown fences, no prose:

{
  "story_content": "The human-readable recap in markdown (150-300 words)",
  "meta_description": "150 char meta description for SEO — MUST mention Đà Lạt",
  "seo_keywords": ["keyword1", "keyword2"],
  "social_share_text": "Short engaging text for social sharing",
  "suggested_cta_text": "See the photos"
}

## Story Content Guidelines
- Open with atmosphere — the weather, the mood, the energy
- Describe 3-5 highlights from the AI-analyzed moments
- Include sensory details: sounds, colors, textures
- NEVER name, identify, or guess at any individual person. Describe the crowd and the vibe, not people. Only the venue name, organizer name, and event title may appear as proper nouns.
- Only state facts present in the event details and moment descriptions below — never invent attendance numbers, performances, or outcomes.
- Close with anticipation — what's next?
- Warm, personal tone. Never corporate.
- MUST mention Đà Lạt naturally at least twice
- Write in English but sprinkle Vietnamese terms where natural

## SEO Keywords
- Mix: "Đà Lạt" variations + event type + venue name + mood/vibe keywords
- Include Vietnamese: "sự kiện Đà Lạt", venue name in Vietnamese
- Long-tail: "live music in Dalat", "cafe events Da Lat"`;

export function buildRecapPrompt(input: RecapPromptInput): string {
  const momentDescriptions = input.moments
    .map((m, i) => {
      const parts = [`Moment ${i + 1} (${m.content_type}):`];
      if (m.ai_title) parts.push(`  Title: ${m.ai_title}`);
      if (m.ai_description) parts.push(`  Description: ${m.ai_description}`);
      if (m.scene_description) parts.push(`  Scene: ${m.scene_description}`);
      if (m.mood) parts.push(`  Mood: ${m.mood}`);
      if (m.detected_objects?.length) parts.push(`  Objects: ${m.detected_objects.join(", ")}`);
      if (m.video_summary) parts.push(`  Video summary: ${m.video_summary}`);
      if (m.audio_summary) parts.push(`  Audio summary: ${m.audio_summary}`);
      if (m.ai_tags?.length) parts.push(`  Tags: ${m.ai_tags.join(", ")}`);
      return parts.join("\n");
    })
    .join("\n\n");

  return `${RECAP_SYSTEM}

## Event Details
Title: ${input.event.title}
${input.event.description ? `Description: ${input.event.description}` : ""}
Date: ${input.event.starts_at}${input.event.ends_at ? ` to ${input.event.ends_at}` : ""}
Location: ${input.event.location_name || "Đà Lạt"}
${input.venueName ? `Venue: ${input.venueName}` : ""}
${input.organizerName ? `Organizer: ${input.organizerName}` : ""}
${input.event.ai_tags?.length ? `Tags: ${input.event.ai_tags.join(", ")}` : ""}

## Stats
Total moments: ${input.momentCount}
Photos: ${input.photoCount}
Videos: ${input.videoCount}

## AI-Analyzed Moments
${momentDescriptions}

Generate the event recap JSON now.`;
}

export function parseRecapOutput(output: string): RecapOutput {
  let text = output.trim();
  if (text.startsWith("```json")) text = text.slice(7);
  else if (text.startsWith("```")) text = text.slice(3);
  if (text.endsWith("```")) text = text.slice(0, -3);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`recap output has no JSON object: ${output.slice(0, 200)}`);
  const raw = JSON.parse(match[0]) as Record<string, unknown>;

  const str = (key: string): string => {
    const v = raw[key];
    if (typeof v !== "string" || !v.trim()) throw new Error(`recap output missing ${key}`);
    return v.trim();
  };

  const keywords = Array.isArray(raw.seo_keywords)
    ? (raw.seo_keywords as unknown[]).filter((k): k is string => typeof k === "string")
    : [];

  return {
    story_content: str("story_content"),
    meta_description: str("meta_description"),
    seo_keywords: keywords,
    social_share_text: str("social_share_text"),
    suggested_cta_text: str("suggested_cta_text"),
  };
}
