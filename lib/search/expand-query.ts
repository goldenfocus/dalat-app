import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

/**
 * Use Claude to expand a search query with translations and synonyms.
 * "cherry" → ["cherry", "cherry blossom", "hoa anh đào", "mai anh đào", "sakura"]
 */
export async function expandSearchQuery(query: string): Promise<string[]> {
  // Skip expansion for very short queries or if it looks like Vietnamese already
  if (query.length < 2) {
    return [query];
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `Expand this search query for a Đà Lạt, Vietnam events app. Return Vietnamese translations and related terms. Output ONLY a JSON array of strings, no explanation.

Query: "${query}"

Example for "cherry": ["cherry", "cherry blossom", "hoa anh đào", "mai anh đào", "hoa đào"]
Example for "yoga": ["yoga", "thiền", "meditation"]
Example for "music": ["music", "âm nhạc", "nhạc", "concert", "hòa nhạc"]`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse the JSON array
    const terms = JSON.parse(text.trim());

    if (Array.isArray(terms) && terms.length > 0) {
      // Always include original query first
      const uniqueTerms = [query, ...terms.filter((t: string) => t.toLowerCase() !== query.toLowerCase())];
      return uniqueTerms.slice(0, 8); // Limit to 8 terms
    }

    return [query];
  } catch (error) {
    console.error("Error expanding search query:", error);
    // Fall back to original query
    return [query];
  }
}
