/**
 * AI-powered lyrics review to catch Whisper hallucinations.
 *
 * Whisper hallucinates on mixed-language and AI-generated audio,
 * producing nonsense like YouTube subscribe prompts, tour guide
 * narration, or random scripts (Russian, Sinhala, Khmer).
 *
 * This module sends lyrics to Claude Haiku for review — it removes
 * hallucinated lines, fixes garbled text, and preserves timestamps.
 */

import Anthropic from "@anthropic-ai/sdk";

interface ReviewedLine {
  num: number;
  action: "keep" | "remove" | "fix";
  fixed?: string;
  reason?: string;
}

interface LrcReviewResult {
  cleanedLrc: string;
  removedCount: number;
  fixedCount: number;
  /** "clean" = no changes, "fixed" = some lines cleaned, "mostly_hallucinated" = >50% fake */
  verdict: "clean" | "fixed" | "mostly_hallucinated";
}

/**
 * Parse LRC lines into timestamp + text pairs.
 */
function parseLrcLines(lrc: string): { timestamp: string; text: string }[] {
  const result: { timestamp: string; text: string }[] = [];
  for (const line of lrc.split("\n")) {
    const match = line.match(/^(\[\d{2}:\d{2}\.\d{2,3}\])(.*)$/);
    if (match) {
      result.push({ timestamp: match[1], text: match[2].trim() });
    }
  }
  return result;
}

/**
 * Extract metadata lines from LRC (e.g., [la:vi]).
 */
function extractMetadata(lrc: string): string[] {
  const metadata: string[] = [];
  for (const line of lrc.split("\n")) {
    if (line.match(/^\[[a-z]+:.+\]$/i)) {
      metadata.push(line);
    }
  }
  return metadata;
}

/**
 * Review LRC lyrics with Claude to remove Whisper hallucinations.
 *
 * @param lrc - Raw LRC string from Whisper
 * @param title - Track title (helps Claude understand context)
 * @param artist - Track artist
 * @returns Cleaned LRC with hallucinations removed
 */
export async function reviewLyricsWithAI(
  lrc: string,
  title: string = "",
  artist: string = ""
): Promise<LrcReviewResult> {
  const lines = parseLrcLines(lrc);
  const metadata = extractMetadata(lrc);

  // Nothing to review
  if (lines.length === 0) {
    return { cleanedLrc: lrc, removedCount: 0, fixedCount: 0, verdict: "clean" };
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.warn("[review-lyrics] ANTHROPIC_API_KEY not set, skipping review");
    return { cleanedLrc: lrc, removedCount: 0, fixedCount: 0, verdict: "clean" };
  }

  const claude = new Anthropic({ apiKey: anthropicKey });

  const numberedLines = lines.map((l, i) => `${i + 1}. ${l.text}`).join("\n");

  try {
    const response = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: `You are a lyrics quality reviewer. You identify lines that are Whisper transcription hallucinations — text that is NOT actual song lyrics but was fabricated by the speech-to-text model.

Common hallucination patterns:
- YouTube channel promotions ("subscribe", "like and share", channel names)
- Tour guide narration ("to your left/right is the...")
- Website URLs or attribution lines ("Amara.org", "Translated by", "Thanks for watching")
- Repetitive nonsensical text that doesn't fit the song
- Text in a completely different language/script than the song
- Generic filler phrases repeated many times
- Just musical note symbols (♪) with no actual text

Songs from this app are typically Vietnamese, English, French, or mixed-language music about Dalat, Vietnam.

Respond ONLY with valid JSON, no markdown fences.`,
      messages: [
        {
          role: "user",
          content: `Review these lyrics from "${title || "Unknown"}" by "${artist || "Unknown"}".

Mark each line as "keep", "remove" (hallucination), or "fix" (garbled but real lyrics).
For "fix" lines, provide the corrected text.

Lines:
${numberedLines}

Respond as JSON:
{
  "lines": [
    { "num": 1, "action": "keep" },
    { "num": 2, "action": "remove", "reason": "YouTube channel promo" },
    { "num": 3, "action": "fix", "fixed": "corrected text", "reason": "garbled Vietnamese" }
  ]
}`,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return { cleanedLrc: lrc, removedCount: 0, fixedCount: 0, verdict: "clean" };
    }

    // Strip markdown fences if present
    let jsonStr = textContent.text.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const review: { lines: ReviewedLine[] } = JSON.parse(jsonStr);

    // Rebuild LRC
    const cleanedLines: string[] = [];
    let removedCount = 0;
    let fixedCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineReview = review.lines.find((r) => r.num === i + 1);
      const action = lineReview?.action || "keep";

      if (action === "remove") {
        removedCount++;
      } else if (action === "fix" && lineReview?.fixed) {
        fixedCount++;
        cleanedLines.push(`${lines[i].timestamp}${lineReview.fixed}`);
      } else {
        cleanedLines.push(`${lines[i].timestamp}${lines[i].text}`);
      }
    }

    // Determine verdict
    const removedRatio = removedCount / lines.length;
    let verdict: LrcReviewResult["verdict"] = "clean";
    if (removedRatio > 0.5) {
      verdict = "mostly_hallucinated";
    } else if (removedCount > 0 || fixedCount > 0) {
      verdict = "fixed";
    }

    const fullLrc = [...metadata, "", ...cleanedLines].join("\n");

    return { cleanedLrc: fullLrc, removedCount, fixedCount, verdict };
  } catch (error) {
    console.error("[review-lyrics] Claude review failed, using raw lyrics:", error);
    return { cleanedLrc: lrc, removedCount: 0, fixedCount: 0, verdict: "clean" };
  }
}
