/**
 * Normalize auto-generated blog story content.
 *
 * Some auto-generated posts (and their 155 stale translated rows) were stored
 * as ONE physical line with zero newlines, starting with "## " — CommonMark
 * parses the whole article as a single h2, which renders terribly. This
 * render-time fix reflows those posts into readable paragraphs without
 * touching legit human-authored markdown.
 */

// U+0000 never appears in real content, is not whitespace (survives the
// sentence splitter), and can't be typed by users — a safe placeholder fence.
const PLACEHOLDER_FENCE = "\u0000";

// Spans that must never be split mid-sentence: images, links, bold.
const PROTECTED_SPAN_REGEX = /!?\[[^\]]*\]\([^)]*\)|\*\*[^*]+\*\*/g;

const SENTENCE_SPLIT_REGEX = /(?<=[.!?])\s+/;

export function normalizeStoryContent(content: string): string {
  // Trigger ONLY for the pathological single-line auto-generated shape —
  // both variants: with a glued "## " heading (renders as one giant h2) and
  // without one (renders as one wall-of-text paragraph).
  if (content.includes("\n") || content.length <= 400) {
    return content;
  }

  // Drop the leading "## " marker if present — the page renders its own title.
  let text = content.trim();
  if (text.startsWith("## ")) {
    text = text.slice(3).trim();
  }

  // Protect link/image/bold spans so sentence splitting can't break them.
  const protectedSpans: string[] = [];
  text = text.replace(PROTECTED_SPAN_REGEX, (match) => {
    const token = `${PLACEHOLDER_FENCE}${protectedSpans.length}${PLACEHOLDER_FENCE}`;
    protectedSpans.push(match);
    return token;
  });

  const sentences = text
    .split(SENTENCE_SPLIT_REGEX)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return content;

  // First sentence stands alone as the lead paragraph.
  const paragraphs: string[] = [sentences[0]];

  // Group the rest into paragraphs of 2-3 sentences.
  const rest = sentences.slice(1);
  let i = 0;
  while (i < rest.length) {
    const remaining = rest.length - i;
    // Avoid a trailing 1-sentence orphan: 4 left → 2 + 2 instead of 3 + 1.
    const take = remaining === 4 ? 2 : Math.min(3, remaining);
    paragraphs.push(rest.slice(i, i + take).join(" "));
    i += take;
  }

  let result = paragraphs.join("\n\n");

  // Restore the protected spans.
  result = result.replace(
    /\u0000(\d+)\u0000/g,
    (_, index) => protectedSpans[Number(index)]
  );

  return result;
}
