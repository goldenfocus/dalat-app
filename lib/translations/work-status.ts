export type TranslationRowState = {
  translated_text?: string | null;
  translation_status?: string;
  is_stale?: boolean;
  updated_at?: string;
  ai_reviewed_at?: string | null;
};
export function translationWorkState(
  row: TranslationRowState | undefined,
  options: { reviewAfter?: string; force?: boolean } = {},
): "ready" | "pending" | "blocked" {
  if (!row) return "pending";
  if (row.translation_status !== "auto")
    return row.is_stale || !row.translated_text?.trim() ? "blocked" : "ready";
  if (row.is_stale || !row.translated_text?.trim() || options.force)
    return "pending";
  if (options.reviewAfter && !row.ai_reviewed_at) {
    const timestamp = Date.parse(row.updated_at || "");
    if (
      !Number.isFinite(timestamp) ||
      timestamp >= Date.parse(options.reviewAfter)
    )
      return "pending";
  }
  return "ready";
}
