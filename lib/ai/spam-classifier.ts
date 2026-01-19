import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface SpamResult {
  isSpam: boolean;
  confidence: number;
  reason: string;
}

/**
 * Detect if an event is spam (service ads masquerading as events).
 * Uses claude-haiku for cost efficiency.
 *
 * Common spam patterns in Đà Lạt:
 * - "Hút Hầm Cầu" (septic tank pumping)
 * - Transportation/taxi services
 * - Repair/maintenance services
 * - Commercial promotions without actual events
 */
export async function classifySpam(
  title: string,
  description: string | null
): Promise<SpamResult> {
  // Skip if no title
  if (!title.trim()) {
    return { isSpam: false, confidence: 0, reason: "No content to analyze" };
  }

  // Quick keyword check for obvious spam (save API calls)
  const spamKeywords = [
    'hút hầm cầu', 'hầm cầu', 'thông cống', 'bồn cầu',
    'taxi', 'xe ôm', 'vận chuyển', 'chuyển nhà',
    'sửa chữa', 'điện lạnh', 'máy lạnh', 'điều hòa',
    'vay tiền', 'cho vay', 'tín dụng',
    'bán đất', 'bất động sản', 'nhà đất',
  ];

  const lowerTitle = title.toLowerCase();
  const lowerDesc = (description || '').toLowerCase();
  const combined = `${lowerTitle} ${lowerDesc}`;

  for (const keyword of spamKeywords) {
    if (combined.includes(keyword)) {
      return {
        isSpam: true,
        confidence: 0.95,
        reason: `Contains service/commercial keyword: "${keyword}"`,
      };
    }
  }

  // Use AI for ambiguous cases
  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `Classify if this is a legitimate community event or spam/service ad for Đà Lạt, Vietnam.

Event: ${title}
${description ? `Description: ${description.slice(0, 500)}` : ''}

Output JSON: { "isSpam": boolean, "confidence": 0-1, "reason": "brief explanation" }

SPAM examples: plumbing/repair services, transportation ads, real estate, loans, commercial spam
NOT SPAM: concerts, workshops, meetups, festivals, classes, community gatherings, exhibitions`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.error("Failed to parse spam response:", text);
      return { isSpam: false, confidence: 0.5, reason: "Could not parse AI response" };
    }

    const result = JSON.parse(jsonMatch[0]);
    return {
      isSpam: Boolean(result.isSpam),
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
      reason: String(result.reason || 'AI classification'),
    };
  } catch (error) {
    console.error("Error classifying spam:", error);
    // Default to not spam on error (avoid false positives)
    return { isSpam: false, confidence: 0, reason: "Classification failed" };
  }
}

/**
 * Check if spam score should auto-hide the event.
 * Events with score > 0.8 are auto-hidden pending review.
 */
export function shouldAutoHide(result: SpamResult): boolean {
  return result.isSpam && result.confidence > 0.8;
}
