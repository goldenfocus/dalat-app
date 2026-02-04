/**
 * AI-SEO Keyword Extractor
 *
 * Uses Claude to analyze audio transcripts and metadata
 * to extract SEO-optimized keywords for karaoke pages.
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface SeoKeywords {
  /** Primary themes (tình yêu, quê hương, mùa xuân) */
  themes: string[];
  /** Music genres/styles (ballad, bolero, nhạc trẻ) */
  genres: string[];
  /** Mood/emotion (buồn, vui, sâu lắng) */
  moods: string[];
  /** Notable lyric phrases for long-tail keywords */
  phrases: string[];
  /** Language detected */
  language: string;
  /** Combined SEO string ready for meta tags */
  keywords: string;
}

interface ExtractKeywordsInput {
  /** Song title */
  title: string;
  /** Artist name */
  artist: string;
  /** Full transcript from Whisper */
  transcript: string;
  /** LRC lyrics (optional, for structure hints) */
  lrc?: string;
}

/**
 * Extract SEO keywords from audio transcript using Claude.
 *
 * @param input - Song metadata and transcript
 * @returns Structured SEO keywords
 *
 * @example
 * ```ts
 * const keywords = await extractSeoKeywords({
 *   title: "Tình Yêu Màu Nắng",
 *   artist: "Đoàn Thùy Trang",
 *   transcript: "Tình yêu đến trong đời cùng với nắng mai..."
 * });
 * // Returns: { themes: ["tình yêu", "ánh sáng"], genres: ["ballad"]... }
 * ```
 */
export async function extractSeoKeywords(
  input: ExtractKeywordsInput
): Promise<SeoKeywords> {
  const { title, artist, transcript } = input;

  const prompt = `Analyze this Vietnamese/multilingual song for SEO keyword extraction.

SONG INFO:
- Title: ${title}
- Artist: ${artist}

TRANSCRIPT:
${transcript.slice(0, 3000)}

Extract the following in JSON format:
{
  "themes": ["main themes like tình yêu, quê hương, mùa xuân, gia đình - max 5"],
  "genres": ["music styles like ballad, bolero, nhạc trẻ, pop, acoustic - max 3"],
  "moods": ["emotional qualities like buồn, vui, sâu lắng, da diết - max 3"],
  "phrases": ["3-5 memorable lyric phrases good for long-tail SEO, keep short"],
  "language": "detected language code (vi, en, fr, etc)"
}

Focus on:
1. Vietnamese search terms people would use to find this song
2. Karaoke-related keywords (hát karaoke, lời bài hát, sing along)
3. Emotional/thematic keywords that match search intent

Return ONLY valid JSON, no explanation.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Build combined keywords string
    const allKeywords = [
      // Base karaoke keywords
      "karaoke",
      "karaoke đà lạt",
      "hát karaoke",
      "lời bài hát",
      // Song info
      title,
      artist,
      // Extracted data
      ...parsed.themes,
      ...parsed.genres,
      ...parsed.moods,
      // Vietnamese variations
      "nhạc việt",
      "karaoke online",
    ].filter(Boolean);

    return {
      themes: parsed.themes || [],
      genres: parsed.genres || [],
      moods: parsed.moods || [],
      phrases: parsed.phrases || [],
      language: parsed.language || "vi",
      keywords: [...new Set(allKeywords)].join(", "),
    };
  } catch (error) {
    console.error("Failed to extract SEO keywords:", error);

    // Return basic fallback
    return {
      themes: [],
      genres: [],
      moods: [],
      phrases: [],
      language: "vi",
      keywords: `karaoke, ${title}, ${artist}, karaoke đà lạt, nhạc việt, hát karaoke online`,
    };
  }
}

/**
 * Batch extract keywords for multiple tracks.
 * Adds delays to respect rate limits.
 */
export async function extractSeoKeywordsBatch(
  tracks: ExtractKeywordsInput[]
): Promise<Map<string, SeoKeywords>> {
  const results = new Map<string, SeoKeywords>();

  for (const track of tracks) {
    const key = `${track.title}-${track.artist}`;

    try {
      const keywords = await extractSeoKeywords(track);
      results.set(key, keywords);

      // Rate limiting - 1 second between requests
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to extract keywords for ${key}:`, error);
    }
  }

  return results;
}
