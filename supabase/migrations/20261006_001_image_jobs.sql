-- Image generation job queue for the Mac mini worker (flux2-klein-4b).
-- Replaces synchronous Gemini generation (dead since the GCP billing lapse).
--
-- Flow: authed API enqueues (ownership checked, R2 key minted) ->
-- worker claims via claim_image_jobs() -> generates locally -> presigned
-- PUT to R2 -> /complete sets result_url. The job row is the sole source
-- of truth; parent tables are only written when the user applies the image.

CREATE TABLE image_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context text NOT NULL CHECK (context IN ('avatar', 'event-cover', 'venue-cover', 'blog-cover')),
  prompt text NOT NULL,
  width int NOT NULL DEFAULT 1024,
  height int NOT NULL DEFAULT 1024,
  entity_id uuid,
  bucket text NOT NULL,
  r2_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  result_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_image_jobs_queue ON image_jobs (status, created_at);
CREATE INDEX idx_image_jobs_user ON image_jobs (user_id, status);

ALTER TABLE image_jobs ENABLE ROW LEVEL SECURITY;

-- Users can watch their own jobs (status polling). All writes go through
-- the service role; there is no INSERT/UPDATE/DELETE policy on purpose.
CREATE POLICY "Users can view own image jobs"
  ON image_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- Worker liveness. The claim endpoint upserts last_seen on every poll;
-- the enqueue endpoint refuses new jobs when the worker has gone dark.
CREATE TABLE worker_heartbeats (
  worker text PRIMARY KEY,
  last_seen timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE worker_heartbeats ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.

-- Atomic claim with lease + retry semantics:
--  * stale 'processing' jobs (lease > 5 min: worker died/OOMed mid-job)
--    are retried up to 3 attempts, then marked failed;
--  * SKIP LOCKED makes concurrent claims safe.
CREATE OR REPLACE FUNCTION claim_image_jobs(p_limit int DEFAULT 1)
RETURNS SETOF image_jobs
LANGUAGE sql
AS $$
  WITH exhausted AS (
    UPDATE image_jobs
    SET status = 'failed',
        error = COALESCE(error, 'exceeded max attempts'),
        completed_at = now()
    WHERE status = 'processing'
      AND claimed_at < now() - interval '5 minutes'
      AND attempts >= 3
  ),
  picked AS (
    SELECT id FROM image_jobs
    WHERE status = 'pending'
       OR (status = 'processing' AND claimed_at < now() - interval '5 minutes' AND attempts < 3)
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE image_jobs j
  SET status = 'processing', claimed_at = now(), attempts = j.attempts + 1
  FROM picked
  WHERE j.id = picked.id
  RETURNING j.*;
$$;

-- Service role only — clients must never claim jobs.
REVOKE ALL ON FUNCTION claim_image_jobs(int) FROM PUBLIC, anon, authenticated;
