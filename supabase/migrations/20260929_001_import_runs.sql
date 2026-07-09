-- Import run heartbeat: one row per scraper run per source.
-- Powers the Telegram digest, the zero-twice-in-a-row alarm, and the
-- dead-source watchdog in /api/cron/health-check.
--
-- Context: the event aggregator died silently in Feb 2026 (dead Apify token +
-- retired Claude model, both swallowed) and nobody noticed for 5 months.
-- This table is the evidence trail that makes "broken" distinguishable from
-- "found nothing".

CREATE TABLE IF NOT EXISTS import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,               -- 'facebook' | 'dalat-gov' | 'manual'
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  raw_seen int NOT NULL DEFAULT 0,    -- items the source surfaced BEFORE filtering (health evidence)
  imported int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0,
  error_detail text
);

CREATE INDEX IF NOT EXISTS idx_import_runs_source_time
  ON import_runs (source, started_at DESC);

-- Service-role only: RLS enabled with no policies.
ALTER TABLE import_runs ENABLE ROW LEVEL SECURITY;
