/**
 * Recap generation moved to the keyless pipeline (caption_jobs
 * content_type 'recap' → Mac-mini claude -p worker). Prompt building and
 * output parsing live in ./recap-input. This file intentionally has no
 * SDK imports — scripts/check-recap-keyless.mjs enforces that.
 */
export {
  selectRecapMoments,
  buildRecapPrompt,
  parseRecapOutput,
  RECAP_PROMPT_VERSION,
  type RecapMomentRow,
  type RecapPromptInput,
  type RecapOutput,
} from "./recap-input";
