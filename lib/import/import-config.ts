/**
 * Shared configuration for automated event imports.
 */

// Legacy import safety gate. Background callers are retired; any remaining
// explicit admin import defaults to a non-public draft unless deliberately
// configured otherwise. Machine discovery publishes only via Activity Graph.
export const IMPORT_STATUS: "draft" | "published" =
  process.env.IMPORT_AUTO_PUBLISH === "true" ? "published" : "draft";

// Hard cap per source per run — a first run after a dead period could
// otherwise dump 50-100 events at once (each translated to 12 languages,
// each firing DB triggers, all hitting the homepage within one ISR cycle).
export const MAX_IMPORTS_PER_RUN = 15;
