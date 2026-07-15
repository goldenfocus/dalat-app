import Anthropic from "@anthropic-ai/sdk";
import { unstable_cache } from "next/cache";
import { after } from "next/server";

const anthropic = new Anthropic();

const EXPANSION_TIMEOUT_MS = 1500;
// Bound on the LLM call itself so a background completion can't hang for minutes
const LLM_REQUEST_TIMEOUT_MS = 10_000;
const MAX_QUERY_LENGTH = 80;

// Sentinel so the catch can tell "race timed out" apart from real API errors
const EXPANSION_TIMED_OUT = Symbol("expansion-timed-out");

/**
 * Normalize a query for cache keying and LLM input:
 * lowercased, trimmed, collapsed whitespace, capped length.
 */
function normalizeQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, MAX_QUERY_LENGTH);
}

/**
 * Cached LLM expansion keyed by normalized query.
 * Errors throw (and are NOT cached) so the caller can fall back
 * to the raw query without poisoning the cache for 24h.
 */
const getCachedExpansion = unstable_cache(
  async (normalizedQuery: string): Promise<string[]> => {
    const response = await anthropic.messages.create(
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: `Expand this search query for a Đà Lạt, Vietnam events app. Return Vietnamese translations and related terms. Output ONLY a JSON array of strings, no explanation.

Query: "${normalizedQuery}"

Example for "cherry": ["cherry", "cherry blossom", "hoa anh đào", "mai anh đào", "hoa đào"]
Example for "yoga": ["yoga", "thiền", "meditation"]
Example for "music": ["music", "âm nhạc", "nhạc", "concert", "hòa nhạc"]`,
          },
        ],
      },
      { timeout: LLM_REQUEST_TIMEOUT_MS }
    );

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse the JSON array
    const terms = JSON.parse(text.trim());

    if (Array.isArray(terms)) {
      return terms.filter((t): t is string => typeof t === "string").slice(0, 8);
    }

    return [];
  },
  ["search-query-expansion"],
  { revalidate: 86400 }
);

/**
 * Use Claude to expand a search query with translations and synonyms.
 * "cherry" → ["cherry", "cherry blossom", "hoa anh đào", "mai anh đào", "sakura"]
 *
 * Results are cached for 24h per normalized query. The response is raced
 * against a 1.5s timeout — on timeout the original query is returned alone,
 * but the LLM call completes in the background so it still seeds the cache
 * and the next request for this query gets the expansion.
 */
export async function expandSearchQuery(query: string): Promise<string[]> {
  const normalized = normalizeQuery(query);

  // Skip expansion for very short queries
  if (normalized.length < 2) {
    return [query];
  }

  const expansion = getCachedExpansion(normalized);
  // Handled copy: if the race times out first, the eventual rejection of the
  // still-running expansion must not become an unhandled rejection
  const settled = expansion.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const terms = await Promise.race([
      expansion,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(EXPANSION_TIMED_OUT), EXPANSION_TIMEOUT_MS);
      }),
    ]);

    // Always include original query first
    const uniqueTerms = [
      query,
      ...terms.filter((t) => t.toLowerCase() !== query.toLowerCase()),
    ];
    return uniqueTerms.slice(0, 8);
  } catch (error) {
    if (error === EXPANSION_TIMED_OUT) {
      // Let the slow call finish out-of-band to seed the cache
      after(settled);
      console.warn(
        `[expand-query] timed out after ${EXPANSION_TIMEOUT_MS}ms for "${normalized}" — completing in background to seed the cache`
      );
    } else if (error instanceof Anthropic.APIError) {
      console.error(
        `[expand-query] Anthropic API error (status ${error.status}) for "${normalized}":`,
        error.message
      );
    } else if (error instanceof SyntaxError) {
      console.error(
        `[expand-query] unparseable LLM output for "${normalized}":`,
        error.message
      );
    } else {
      console.error(`[expand-query] unexpected error for "${normalized}":`, error);
    }
    // Fall back to original query
    return [query];
  } finally {
    clearTimeout(timer);
  }
}
