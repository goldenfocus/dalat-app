-- Caption job queue for the Mac mini caption worker — keyless captioning
-- (subscription `claude -p` / local VLM; no pay-per-token API keys).
--
-- Flow: /api/cron/process-moments is the ONLY enqueuer (the SACRED privacy
-- gate runs there, so a gated moment's media URL never reaches a job row) ->
-- worker claims via claim_caption_jobs() -> vision inference off-server ->
-- POST /api/admin/caption-jobs/complete validates the raw model output and
-- settles moment_metadata. The job row persists as the audit trail
-- (provider, model, prompt_version), so re-captioning everything a given
-- provider produced is a WHERE clause, not archaeology.

CREATE TABLE caption_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL UNIQUE REFERENCES moments(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('image', 'video')),
  media_urls jsonb NOT NULL,          -- image: [url]; video: key-frame urls
  transcript text,                    -- video: CF Stream transcript, resolved at enqueue
  transcript_language text,
  prompt text NOT NULL,               -- built server-side at enqueue; worker stays dumb
  prompt_version text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  retry_rounds int NOT NULL DEFAULT 0, -- daily re-opens of a failed job, capped in app code
  claimed_at timestamptz,
  provider text,                      -- e.g. 'claude-code' | 'ollama'
  model text,
  result jsonb,                       -- normalized analysis, for audit/re-runs
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_caption_jobs_queue ON caption_jobs (status, created_at);

-- Service-role only: RLS on, zero policies — an RLS-less public table is an
-- open PostgREST endpoint.
ALTER TABLE caption_jobs ENABLE ROW LEVEL SECURITY;

-- Atomic claim with lease + retry semantics, mirroring claim_image_jobs:
--  * stale 'processing' jobs (lease > 15 min: worker died mid-batch) are
--    retried up to 3 attempts, then marked failed;
--  * SKIP LOCKED makes concurrent claims safe.
CREATE FUNCTION claim_caption_jobs(p_limit int DEFAULT 10)
RETURNS SETOF caption_jobs
LANGUAGE sql
AS $$
  WITH exhausted AS (
    UPDATE caption_jobs
    SET status = 'failed',
        error = COALESCE(error, 'exceeded max attempts'),
        completed_at = now()
    WHERE status = 'processing'
      AND claimed_at < now() - interval '15 minutes'
      AND attempts >= 3
  ),
  picked AS (
    SELECT id FROM caption_jobs
    WHERE status = 'pending'
       OR (status = 'processing' AND claimed_at < now() - interval '15 minutes' AND attempts < 3)
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE caption_jobs j
  SET status = 'processing', claimed_at = now(), attempts = j.attempts + 1
  FROM picked
  WHERE j.id = picked.id
  RETURNING j.*;
$$;

-- Service role only — clients must never claim jobs.
REVOKE ALL ON FUNCTION claim_caption_jobs(int) FROM PUBLIC, anon, authenticated;
