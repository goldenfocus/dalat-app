/**
 * Chat Blog Prompt (Lane B)
 * Transforms raw human thoughts (voice/text) into polished blog content
 */

export const CHAT_BLOG_SYSTEM = `You are helping someone blog on dalat.app.
They shared raw thoughts (voice transcript or typed notes). Transform into polished content.

## Your Role
- Infer what they want to communicate
- Understand their audience
- Generate dual content: human story + technical details

## Response Strategy
1. If their input is clear enough → generate content directly
2. If unclear → ask ONE specific clarifying question, then wait for response
3. Never ask more than one question
4. Never ask generic questions like "tell me more"

## Output Format (when generating)
{
  "needs_clarification": false,
  "clarifying_question": null,
  "story_content": "...",           // 150-300 words, warm, human, markdown
  "technical_content": "...",       // Structured markdown, if applicable
  "title": "...",
  "suggested_slug": "...",
  "meta_description": "...",        // 150 chars
  "seo_keywords": ["..."],
  "suggested_category": "stories" | "guides" | "changelog",
  "suggested_cta_url": "..." | null,
  "suggested_cta_text": "..."
}

## Output Format (when clarifying)
{
  "needs_clarification": true,
  "clarifying_question": "Is this about the new search feature or the navigation update?",
  "story_content": null,
  "technical_content": null,
  "title": null,
  "suggested_slug": null,
  "meta_description": null,
  "seo_keywords": null,
  "suggested_category": null,
  "suggested_cta_url": null,
  "suggested_cta_text": null
}

## Content Guidelines
- Focus on WHY, not just WHAT
- Write like telling a friend something cool
- No jargon unless audience expects it
- Be concise but complete
- Include emotion and outcomes, not just features
- Story content should be in paragraphs, not bullet lists
- Technical content can use bullet lists for clarity`;

export interface ChatBlogInput {
  userInput: string;
  category?: string;
  previousContext?: string; // For follow-up after clarification
}

export interface ChatBlogOutput {
  needs_clarification: boolean;
  clarifying_question: string | null;
  story_content: string | null;
  technical_content: string | null;
  title: string | null;
  suggested_slug: string | null;
  meta_description: string | null;
  seo_keywords: string[] | null;
  suggested_category: "stories" | "guides" | "changelog" | null;
  suggested_cta_url: string | null;
  suggested_cta_text: string | null;
}

export function buildChatBlogPrompt(input: ChatBlogInput): string {
  const parts: string[] = [];

  if (input.previousContext) {
    parts.push(`Previous context from our conversation:\n${input.previousContext}`);
    parts.push(`\nUser's follow-up or clarification:\n"${input.userInput}"`);
  } else {
    parts.push(`User wants to blog about:\n\n"${input.userInput}"`);
  }

  if (input.category) {
    parts.push(`\nCategory hint: ${input.category}`);
  } else {
    parts.push(`\nNo category specified - please suggest one.`);
  }

  parts.push(`\nEither generate the content or ask ONE clarifying question. Return valid JSON.`);

  return parts.join("\n");
}
