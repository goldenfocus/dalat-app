/**
 * Shared configuration for automated event imports.
 */

// Draft gate: scraped events land as drafts for review (Telegram digest links
// to the admin). Flip IMPORT_AUTO_PUBLISH=true in Vercel env once scrape
// quality is proven — no redeploy needed.
export const IMPORT_STATUS: "draft" | "published" =
  process.env.IMPORT_AUTO_PUBLISH === "true" ? "published" : "draft";

// Hard cap per source per run — a first run after a dead period could
// otherwise dump 50-100 events at once (each translated to 12 languages,
// each firing DB triggers, all hitting the homepage within one ISR cycle).
export const MAX_IMPORTS_PER_RUN = 15;
