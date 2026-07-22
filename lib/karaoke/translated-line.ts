/**
 * Pair a translated lyrics blob with a parsed LRC line by index.
 *
 * Translated lyrics are stored as plain text, one line per LRC lyric line.
 * Pairing is only trusted when the line counts match exactly (the LRC
 * parser can drop spam lines, which would shift indexes) — otherwise
 * returns null and the UI simply shows no translation.
 */
export function getTranslatedLine(
  translated: string | null | undefined,
  lineIndex: number,
  totalLines: number,
  originalText: string | null | undefined
): string | null {
  if (!translated || lineIndex < 0 || totalLines === 0) return null;
  const lines = translated.split("\n").map((l) => l.trim());
  if (lines.length !== totalLines) return null;
  const t = lines[lineIndex];
  if (!t) return null;
  // Same text as the sung line (e.g. source-language "translation") — noise
  if (t.toLowerCase() === originalText?.trim().toLowerCase()) return null;
  return t;
}
