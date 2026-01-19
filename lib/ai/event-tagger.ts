import Anthropic from "@anthropic-ai/sdk";
import { EVENT_TAGS, filterValidTags, type EventTag } from "@/lib/constants/event-tags";

const anthropic = new Anthropic();

export interface TaggingResult {
  tags: EventTag[];
  confidence: number;
}

/**
 * Auto-categorize an event using AI.
 * Uses claude-haiku for cost efficiency (~10x cheaper than sonnet).
 */
export async function tagEvent(
  title: string,
  description: string | null,
  locationName: string | null
): Promise<TaggingResult> {
  // Skip if no meaningful content
  if (!title.trim()) {
    return { tags: [], confidence: 0 };
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `Categorize this Đà Lạt, Vietnam event with 2-5 tags from this list:
${EVENT_TAGS.join(', ')}

Event: ${title}
${description ? `Description: ${description.slice(0, 500)}` : ''}
${locationName ? `Location: ${locationName}` : ''}

Output ONLY a JSON array of tags, most relevant first. Example: ["music", "concert", "outdoor"]`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      console.error("Failed to parse tags response:", text);
      return { tags: [], confidence: 0 };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      return { tags: [], confidence: 0 };
    }

    // Filter to only valid tags and limit to 5
    const validTags = filterValidTags(parsed.map((t: string) => t.toLowerCase()));
    const uniqueTags = [...new Set(validTags)].slice(0, 5);

    return {
      tags: uniqueTags,
      confidence: uniqueTags.length > 0 ? 0.9 : 0,
    };
  } catch (error) {
    console.error("Error tagging event:", error);
    return { tags: [], confidence: 0 };
  }
}

/**
 * Batch tag multiple events efficiently.
 * For bulk operations like initial tagging of existing events.
 */
export async function tagEventsBatch(
  events: Array<{
    id: string;
    title: string;
    description: string | null;
    location_name: string | null;
  }>
): Promise<Map<string, TaggingResult>> {
  const results = new Map<string, TaggingResult>();

  // Process in parallel with concurrency limit
  const BATCH_SIZE = 5;
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (event) => {
      const result = await tagEvent(event.title, event.description, event.location_name);
      results.set(event.id, result);
    });
    await Promise.all(promises);
  }

  return results;
}
