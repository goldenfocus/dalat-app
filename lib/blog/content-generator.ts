import Anthropic from "@anthropic-ai/sdk";
import type {
  BlogContentGeneratorInput,
  BlogContentGeneratorOutput,
} from "@/lib/types/blog";

const STORYTELLING_PROMPT = `You are a storyteller for dalat.app, turning technical release notes into engaging human stories. Your readers are event organizers and community members in Đà Lạt, Vietnam - not developers.

## Your Task
Transform the technical release notes into TWO versions:
1. A human-friendly story that focuses on feelings, benefits, and outcomes
2. A machine-readable technical breakdown for SEO and AI crawlers

## Output Format (JSON)
Return a valid JSON object with these exact fields:

{
  "story_content": "The human-readable story in markdown (150-250 words)",
  "suggested_image_descriptions": ["Description 1 for AI image generation", "Description 2"],
  "technical_content": "Detailed technical content in markdown with full feature list",
  "seo_keywords": ["keyword1", "keyword2", "keyword3"],
  "related_features": ["related-feature-slug-1", "related-feature-slug-2"],
  "has_breaking_changes": false,
  "suggested_slug": "the-feature-slug",
  "meta_description": "150 character meta description for SEO",
  "social_share_text": "Short engaging text for social media sharing",
  "suggested_cta_url": "/path/to/feature or null if no specific page",
  "suggested_cta_text": "Try it now"
}

## Story Content Guidelines
Write a SHORT, engaging story (150-250 words) that:
1. Opens with emotion/context - Why does this matter to users?
2. Explains the "why" - What problem were we solving? What inspired this?
3. Shows the benefit - How does this improve their experience?
4. Ends with action - Invite them to try it

Rules for story_content:
- NO bullet points, NO technical jargon
- Write like you're telling a friend about something cool
- Focus on feelings and outcomes, not features
- Use paragraphs, not lists
- Can include emoji sparingly for emphasis
- Should feel warm and personal

## Technical Content Guidelines
Provide structured, detailed content with:
- Full feature list with technical details (markdown list is OK here)
- Any breaking changes clearly marked with ⚠️
- Migration notes if applicable
- Performance improvements with metrics if available
- API changes if any

## SEO Keywords Guidelines
- Include 5-8 relevant keywords
- Mix broad terms (events, community) with specific ones (dalat, vietnam)
- Include feature-specific keywords

## Example Input
Title: feat: add instant search
Body: "Added real-time search with Algolia. Supports fuzzy matching, filters by date/location/tags. Keyboard shortcut Cmd+K."
Category: changelog

## Example Output
{
  "story_content": "Remember the frustration of scrolling through dozens of events to find that perfect yoga class? We felt it too.\\n\\nWe built instant search because discovery should feel effortless. Now, the moment you start typing, events appear like magic. Looking for \\\"sunrise yoga\\\" or your favorite organizer? Just a few keystrokes away.\\n\\nThis is live now. Press ⌘K anywhere (or tap the search icon) and watch your community come to life.",
  "suggested_image_descriptions": ["Abstract visualization of search with glowing connections between event cards, purple and blue gradient, Đà Lạt mountains in background", "Person discovering events on phone with magical sparkles, warm evening light"],
  "technical_content": "## Instant Search\\n\\n### Features\\n- Real-time search results as you type\\n- Fuzzy matching for typos and variations\\n- Filter by date, location, and tags\\n- Keyboard shortcut: ⌘K (Mac) / Ctrl+K (Windows)\\n\\n### Technical Details\\n- Powered by Algolia Search\\n- Sub-50ms response times\\n- Supports Vietnamese text including diacritics\\n- Index updated every 5 minutes",
  "seo_keywords": ["event search", "dalat events", "find events", "instant search", "event discovery", "community events vietnam"],
  "related_features": ["event-filters", "navigation-improvements"],
  "has_breaking_changes": false,
  "suggested_slug": "add-instant-search",
  "meta_description": "Find events instantly with our new search. Type a few letters and discover yoga, music, and community events in Đà Lạt.",
  "social_share_text": "Finding events in Đà Lạt just got magical ✨ Introducing instant search!",
  "suggested_cta_url": "/",
  "suggested_cta_text": "Try searching now"
}`;

/**
 * Generate dual content (human story + technical) from release notes
 * Uses Claude to transform developer-focused release notes into engaging stories
 */
export async function generateBlogContent(
  input: BlogContentGeneratorInput
): Promise<BlogContentGeneratorOutput> {
  const client = new Anthropic();

  const userPrompt = `Transform this release into blog content:

Title: ${input.title}
Version: ${input.version || "N/A"}
Category: ${input.category}

Technical Release Notes:
${input.body}

Return a JSON object following the exact format specified in the system prompt.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: STORYTELLING_PROMPT,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Parse the JSON response
  // Handle potential markdown code blocks around JSON
  let jsonText = textContent.text.trim();
  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.slice(7);
  }
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.slice(3);
  }
  if (jsonText.endsWith("```")) {
    jsonText = jsonText.slice(0, -3);
  }
  jsonText = jsonText.trim();

  try {
    const parsed = JSON.parse(jsonText) as BlogContentGeneratorOutput;

    // Validate required fields
    if (!parsed.story_content || !parsed.technical_content) {
      throw new Error("Missing required content fields");
    }

    return {
      story_content: parsed.story_content,
      suggested_image_descriptions: parsed.suggested_image_descriptions || [],
      technical_content: parsed.technical_content,
      seo_keywords: parsed.seo_keywords || [],
      related_features: parsed.related_features || [],
      has_breaking_changes: parsed.has_breaking_changes || false,
      suggested_slug:
        parsed.suggested_slug || slugify(input.title),
      meta_description: parsed.meta_description || "",
      social_share_text: parsed.social_share_text || "",
      suggested_cta_url: parsed.suggested_cta_url,
      suggested_cta_text: parsed.suggested_cta_text || "Try it now",
    };
  } catch (parseError) {
    console.error("Failed to parse AI response:", jsonText);
    throw new Error(
      `Failed to parse AI response as JSON: ${parseError instanceof Error ? parseError.message : "Unknown error"}`
    );
  }
}

/**
 * Create a URL-friendly slug from a title
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(feat|fix|refactor|docs|chore|style|test|perf|ci|build):\s*/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Detect the category from a conventional commit title
 * feat: → changelog (features)
 * fix: → changelog (fixes)
 * docs: → guides
 * refactor:, perf: → changelog (improvements)
 */
export function detectCategoryFromTitle(title: string): string {
  const lowerTitle = title.toLowerCase();

  if (lowerTitle.startsWith("feat:") || lowerTitle.startsWith("feature:")) {
    return "changelog";
  }
  if (lowerTitle.startsWith("fix:") || lowerTitle.startsWith("bugfix:")) {
    return "changelog";
  }
  if (lowerTitle.startsWith("docs:") || lowerTitle.startsWith("doc:")) {
    return "guides";
  }
  if (
    lowerTitle.startsWith("refactor:") ||
    lowerTitle.startsWith("perf:") ||
    lowerTitle.startsWith("style:")
  ) {
    return "changelog";
  }

  // Default to changelog for releases
  return "changelog";
}
