import Anthropic from "@anthropic-ai/sdk";

const EVENT_RECAP_PROMPT = `You are a storyteller for dalat.app, creating engaging recaps of events in Đà Lạt, Vietnam. Your readers are locals, expats, and travelers interested in what's happening in the city.

## Your Task
Given an event's details and AI-analyzed descriptions of photos/videos from the event, create a compelling recap that:
1. Makes people who weren't there wish they'd come
2. Showcases the authentic Đà Lạt experience
3. Is SEO-optimized for discoverability

## Output Format (JSON)
Return a valid JSON object:

{
  "story_content": "The human-readable recap in markdown (200-400 words)",
  "technical_content": "SEO-optimized detailed content with all moment descriptions, keywords",
  "meta_description": "150 char meta description for SEO — MUST mention Đà Lạt",
  "seo_keywords": ["keyword1", "keyword2"],
  "suggested_slug": "event-recap-slug",
  "social_share_text": "Short engaging text for social sharing",
  "suggested_cta_text": "See the photos"
}

## Story Content Guidelines
- Open with atmosphere — the weather, the mood, the energy
- Describe 3-5 highlights from the AI-analyzed moments
- Include sensory details: sounds, colors, textures
- Mention specific people/performers if the moment descriptions reference them
- Close with anticipation — what's next?
- Warm, personal tone. Never corporate.
- MUST mention Đà Lạt naturally at least twice
- Write in English but sprinkle Vietnamese terms where natural

## Technical Content Guidelines
- List ALL moments with their AI descriptions
- Include detected text, objects, and scene details
- Group by theme (performances, food, crowd shots, etc.)
- Include venue details and timestamps
- Keyword-rich but readable

## SEO Keywords
- Mix: "Đà Lạt" variations + event type + venue name + mood/vibe keywords
- Include Vietnamese: "sự kiện Đà Lạt", venue name in Vietnamese
- Long-tail: "live music in Dalat", "cafe events Da Lat"
`;

export interface EventRecapInput {
  event: {
    title: string;
    description: string | null;
    location_name: string | null;
    starts_at: string;
    ends_at: string | null;
    ai_tags: string[] | null;
  };
  moments: {
    content_type: string;
    ai_description: string | null;
    ai_title: string | null;
    scene_description: string | null;
    mood: string | null;
    detected_objects: string[] | null;
    detected_text: string[] | null;
    ai_tags: string[] | null;
    video_summary: string | null;
    audio_summary: string | null;
  }[];
  venueName: string | null;
  organizerName: string | null;
  momentCount: number;
  photoCount: number;
  videoCount: number;
}

export interface EventRecapOutput {
  story_content: string;
  technical_content: string;
  meta_description: string;
  seo_keywords: string[];
  suggested_slug: string;
  social_share_text: string;
  suggested_cta_text: string;
}

export async function generateEventRecap(
  input: EventRecapInput
): Promise<EventRecapOutput> {
  const client = new Anthropic();

  // Build the moment descriptions for the prompt
  const momentDescriptions = input.moments
    .filter((m) => m.ai_description || m.scene_description || m.video_summary || m.audio_summary)
    .map((m, i) => {
      const parts = [`Moment ${i + 1} (${m.content_type}):`];
      if (m.ai_title) parts.push(`  Title: ${m.ai_title}`);
      if (m.ai_description) parts.push(`  Description: ${m.ai_description}`);
      if (m.scene_description) parts.push(`  Scene: ${m.scene_description}`);
      if (m.mood) parts.push(`  Mood: ${m.mood}`);
      if (m.detected_objects?.length) parts.push(`  Objects: ${m.detected_objects.join(", ")}`);
      if (m.detected_text?.length) parts.push(`  Text found: ${m.detected_text.join(", ")}`);
      if (m.video_summary) parts.push(`  Video summary: ${m.video_summary}`);
      if (m.audio_summary) parts.push(`  Audio summary: ${m.audio_summary}`);
      if (m.ai_tags?.length) parts.push(`  Tags: ${m.ai_tags.join(", ")}`);
      return parts.join("\n");
    })
    .join("\n\n");

  const userMessage = `## Event Details
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
${momentDescriptions || "No AI descriptions available yet."}

Generate the event recap now.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: EVENT_RECAP_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse event recap response");
  }

  return JSON.parse(jsonMatch[0]) as EventRecapOutput;
}
