import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedEventData } from "@/lib/types";

/**
 * Generates the extraction prompt with dynamic year handling.
 * If we're in Oct-Dec, dates without year that fall in Jan-Mar use next year.
 * Exported for testing.
 */
export function getExtractionPrompt(now: Date = new Date()): string {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // If we're in Q4, next year's Q1 dates should use next year
  const defaultYear = currentYear;
  const nextYearForEarlyMonths = currentMonth >= 9 ? currentYear + 1 : currentYear;

  return `You are analyzing an event poster or calendar image from Da Lat, Vietnam.
Extract ALL events visible in this image.

For each event, extract the following in JSON format:
- title: Event name (required, keep original language)
- description: Brief description if visible (keep original language)
- starts_at: Date and time in ISO 8601 format with Vietnam timezone (+07:00)
- ends_at: End date/time if specified, otherwise null
- location_name: Venue name if visible
- address: Street address if visible
- confidence: Your confidence in the extraction (0.0-1.0)

Rules:
1. If only a date is shown without a year:
   - For dates in Jan-Mar, use year ${nextYearForEarlyMonths}
   - For all other months, use year ${defaultYear}
   - If no time is shown, assume 19:00
2. If a date range is shown (e.g., "3-4.1"), create separate start/end dates
3. For multi-day events (e.g., "Jan-Mar"), use the first day as starts_at
4. Keep titles and descriptions in their original language (Vietnamese, English, etc.)
5. Confidence: 1.0 = clearly readable, 0.7 = partially visible, 0.5 = inferred
6. Return an empty array [] if no events are detected

Return ONLY valid JSON array, no other text:
[
  {
    "title": "Event Title",
    "description": "Brief description or null",
    "starts_at": "${defaultYear}-01-15T19:00:00+07:00",
    "ends_at": null,
    "location_name": "Venue Name",
    "address": null,
    "confidence": 0.95
  }
]`;
}

export async function extractEventsFromImage(
  imageUrl: string
): Promise<ExtractedEventData[]> {
  const client = new Anthropic();

  // Fetch the image and convert to base64
  const imageResponse = await fetch(imageUrl);
  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString("base64");

  // Determine media type from URL or default to jpeg
  let mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" =
    "image/jpeg";
  if (imageUrl.includes(".png")) mediaType = "image/png";
  else if (imageUrl.includes(".webp")) mediaType = "image/webp";

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64Image,
            },
          },
          {
            type: "text",
            text: getExtractionPrompt(),
          },
        ],
      },
    ],
  });

  // Extract text content from response
  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Parse JSON from response
  const jsonText = textContent.text.trim();

  // Try to extract JSON array from response (in case there's extra text)
  const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error("Claude response:", jsonText);
    throw new Error("Could not find JSON array in response");
  }

  const events: ExtractedEventData[] = JSON.parse(jsonMatch[0]);
  return events;
}

// Levenshtein distance for fuzzy matching (exported for testing)
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export function calculateSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
      .replace(/[^a-z0-9]/g, "");

  const s1 = normalize(a);
  const s2 = normalize(b);

  if (!s1 || !s2) return 0;

  const distance = levenshteinDistance(s1, s2);
  return 1 - distance / Math.max(s1.length, s2.length);
}

interface ExistingEvent {
  id: string;
  title: string;
  starts_at: string;
  location_name: string | null;
}

export async function checkDuplicates(
  extracted: ExtractedEventData[],
  existingEvents: ExistingEvent[]
): Promise<ExtractedEventData[]> {
  return extracted.map((event) => {
    // Get events on the same day
    const eventDate = new Date(event.starts_at).toDateString();
    const sameDayEvents = existingEvents.filter(
      (e) => new Date(e.starts_at).toDateString() === eventDate
    );

    // Check for title similarity
    for (const existing of sameDayEvents) {
      const similarity = calculateSimilarity(event.title, existing.title);

      if (similarity > 0.8) {
        return {
          ...event,
          duplicate_of: existing.id,
          duplicate_confidence: similarity,
        };
      }
    }

    return event;
  });
}
