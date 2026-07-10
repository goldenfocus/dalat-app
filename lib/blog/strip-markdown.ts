/**
 * Convert markdown to plain text for excerpts, meta descriptions, and RSS.
 * Not a full parser — handles the constructs that appear in blog content.
 */
export function markdownToPlainText(md: string, maxLength?: number): string {
  let text = md
    // Images: drop entirely
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // Links: keep the label, drop the URL
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Heading markers
    .replace(/^#{1,6}\s+/gm, "")
    // Blockquote markers
    .replace(/^>\s?/gm, "")
    // Bold / italic / strikethrough / code markers
    .replace(/(\*\*|__|~~|[*_`])/g, "")
    // Collapse all whitespace to single spaces
    .replace(/\s+/g, " ")
    .trim();

  if (maxLength !== undefined && text.length > maxLength) {
    const sliced = text.slice(0, maxLength);
    const lastSpace = sliced.lastIndexOf(" ");
    text = (lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced).trimEnd() + "…";
  }

  return text;
}
