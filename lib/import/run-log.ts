import { SupabaseClient } from "@supabase/supabase-js";
import type { ProcessResult } from "./utils";

/**
 * Heartbeat logging for import runs — see supabase/migrations/20260928_001_import_runs.sql.
 * Every scraper run records what it saw, so "broken" is distinguishable from
 * "found nothing" (the ambiguity that let the aggregator die silently for 5 months).
 */

export async function recordImportRun(
  supabase: SupabaseClient,
  source: string,
  startedAt: Date,
  rawSeen: number,
  result: ProcessResult
): Promise<void> {
  const { error } = await supabase.from("import_runs").insert({
    source,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    raw_seen: rawSeen,
    imported: result.processed,
    skipped: result.skipped,
    errors: result.errors,
    error_detail:
      result.errors > 0 ? result.details.slice(0, 10).join("\n") : null,
  });
  // A broken heartbeat must never break the import itself — but it must be visible.
  if (error) {
    console.error(`[import-runs] FAILED to record ${source} run:`, error);
  }
}

/**
 * True when this source's previous run ALSO saw zero raw items — the
 * silent-death signature (dead token, rotted URL, login wall all look like
 * "quiet day" exactly once; twice in a row is an alarm).
 *
 * Call BEFORE recordImportRun so "previous" means the actual prior run.
 */
export async function isRepeatZero(
  supabase: SupabaseClient,
  source: string,
  currentRawSeen: number
): Promise<boolean> {
  if (currentRawSeen > 0) return false;
  const { data } = await supabase
    .from("import_runs")
    .select("raw_seen")
    .eq("source", source)
    .order("started_at", { ascending: false })
    .limit(1);
  return data?.[0] != null && data[0].raw_seen === 0;
}
