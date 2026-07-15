/**
 * Model used for AI extraction in import processors.
 *
 * Alias, not a dated snapshot — dated IDs hit end-of-life and start erroring.
 * (claude-3-5-haiku-20241022 died 2026-02-19 and this pipeline silently
 * imported zero events for 5 months because the error was swallowed.)
 */
export const EXTRACTION_MODEL =
  process.env.EXTRACTION_MODEL || "claude-haiku-4-5";
