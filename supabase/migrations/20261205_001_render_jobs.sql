-- Render job queue for always-on Mac workers (recap shorts today, other kinds later).
-- Macs PULL work: scripts/recap-worker claims a job, heartbeats while rendering,
-- then completes or fails it. Nothing calls into the Mac. Service role only:
-- RLS on with zero policies, every RPC is SECURITY DEFINER with a fixed
-- search_path and executable by service_role alone.
--
-- State machine:
--   queued -> claimed -> rendering -> uploading -> done
--   claimed|rendering|uploading -> queued   (fail with retries left, release, stale heartbeat)
--   claimed|rendering|uploading -> dead     (retries exhausted)
--   claimed|rendering|uploading -> failed   (fail with p_retryable = false)
-- Backoff on retry: 60 s * 2^(attempts-1), capped at 1 h (mirrored in
-- scripts/recap-worker/backoff.ts; keep both in step).
BEGIN;

CREATE TABLE IF NOT EXISTS public.render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]{1,40}$'),
  spec jsonb NOT NULL,
  source_hash text NOT NULL CHECK (char_length(source_hash) BETWEEN 8 AND 128),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'claimed', 'rendering', 'uploading', 'done', 'failed', 'dead')),
  priority integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  run_after timestamptz NOT NULL DEFAULT now(),
  claimed_by text,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  output jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- The same inputs never queue twice.
  CONSTRAINT render_jobs_event_kind_source_key UNIQUE (event_id, kind, source_hash),
  CONSTRAINT render_jobs_active_has_claimant
    CHECK (status NOT IN ('claimed', 'rendering', 'uploading') OR claimed_by IS NOT NULL),
  CONSTRAINT render_jobs_done_has_output CHECK (status <> 'done' OR output IS NOT NULL)
);

COMMENT ON TABLE public.render_jobs IS 'Service-role-only queue of video render jobs pulled by Mac workers.';

-- Claim query: queued rows, highest priority first, then oldest due.
CREATE INDEX IF NOT EXISTS idx_render_jobs_claim
  ON public.render_jobs (priority DESC, run_after, created_at)
  WHERE status = 'queued';

-- Stale sweep: active rows ordered by last heartbeat.
CREATE INDEX IF NOT EXISTS idx_render_jobs_active_heartbeat
  ON public.render_jobs (heartbeat_at)
  WHERE status IN ('claimed', 'rendering', 'uploading');

DROP TRIGGER IF EXISTS render_jobs_updated_at ON public.render_jobs;
CREATE TRIGGER render_jobs_updated_at BEFORE UPDATE ON public.render_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;
-- No policies: clients never see this table; the service role bypasses RLS.

REVOKE ALL ON TABLE public.render_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.render_jobs TO service_role;

-- Retry delay for the attempt that just failed (attempts >= 1).
CREATE OR REPLACE FUNCTION public.render_job_backoff(p_attempts integer)
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT make_interval(secs => least(3600, 60 * power(2, greatest(p_attempts - 1, 0))));
$$;

-- Atomically claim the next due job. Returns zero rows when nothing is due.
CREATE OR REPLACE FUNCTION public.claim_render_job(p_worker_id text, p_kinds text[] DEFAULT NULL)
RETURNS SETOF public.render_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_worker_id IS NULL OR btrim(p_worker_id) = '' THEN
    RAISE EXCEPTION 'worker id required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.render_jobs
    WHERE status = 'queued'
      AND run_after <= now()
      AND (p_kinds IS NULL OR kind = ANY (p_kinds))
    ORDER BY priority DESC, run_after, created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.render_jobs j
  SET status = 'claimed',
      claimed_by = p_worker_id,
      claimed_at = now(),
      heartbeat_at = now(),
      attempts = j.attempts + 1
  FROM picked
  WHERE j.id = picked.id
  RETURNING j.*;
END;
$$;

-- Extend the lease; optionally advance claimed -> rendering -> uploading (forward only).
-- Returns false when the caller no longer owns the job (the worker must stop).
CREATE OR REPLACE FUNCTION public.heartbeat_render_job(p_job_id uuid, p_worker_id text, p_status text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF p_status IS NOT NULL AND p_status NOT IN ('rendering', 'uploading') THEN
    RAISE EXCEPTION 'invalid progress status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.render_jobs
  SET heartbeat_at = now(),
      status = CASE
        WHEN p_status = 'rendering' AND status = 'claimed' THEN 'rendering'
        WHEN p_status = 'uploading' AND status IN ('claimed', 'rendering') THEN 'uploading'
        ELSE status
      END
  WHERE id = p_job_id
    AND claimed_by = p_worker_id
    AND status IN ('claimed', 'rendering', 'uploading');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

-- Mark the job done and store its output. Returns false when the caller is not the claimant.
CREATE OR REPLACE FUNCTION public.complete_render_job(p_job_id uuid, p_worker_id text, p_output jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF p_output IS NULL OR jsonb_typeof(p_output) <> 'object' THEN
    RAISE EXCEPTION 'output must be a json object' USING ERRCODE = '22023';
  END IF;

  UPDATE public.render_jobs
  SET status = 'done', output = p_output, error = NULL, heartbeat_at = now()
  WHERE id = p_job_id
    AND claimed_by = p_worker_id
    AND status IN ('claimed', 'rendering', 'uploading');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

-- Record a failure. Re-queues with backoff until max_attempts, then 'dead'.
-- p_retryable = false marks the job 'failed' immediately (e.g. invalid spec).
-- Returns the new status, or NULL when the caller is not the claimant.
CREATE OR REPLACE FUNCTION public.fail_render_job(
  p_job_id uuid, p_worker_id text, p_error text, p_retryable boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_job public.render_jobs;
  v_status text;
BEGIN
  SELECT * INTO v_job FROM public.render_jobs
  WHERE id = p_job_id
    AND claimed_by = p_worker_id
    AND status IN ('claimed', 'rendering', 'uploading')
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_status := CASE
    WHEN NOT p_retryable THEN 'failed'
    WHEN v_job.attempts >= v_job.max_attempts THEN 'dead'
    ELSE 'queued'
  END;

  UPDATE public.render_jobs
  SET status = v_status,
      error = left(coalesce(p_error, 'unknown error'), 2000),
      run_after = CASE WHEN v_status = 'queued'
                       THEN now() + public.render_job_backoff(v_job.attempts)
                       ELSE run_after END,
      claimed_by = CASE WHEN v_status = 'queued' THEN NULL ELSE claimed_by END
  WHERE id = p_job_id;
  RETURN v_status;
END;
$$;

-- Hand a job back untouched (graceful shutdown): re-queue now and refund the attempt.
CREATE OR REPLACE FUNCTION public.release_render_job(p_job_id uuid, p_worker_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.render_jobs
  SET status = 'queued',
      claimed_by = NULL,
      attempts = greatest(attempts - 1, 0),
      run_after = now()
  WHERE id = p_job_id
    AND claimed_by = p_worker_id
    AND status IN ('claimed', 'rendering', 'uploading');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

-- Recover jobs whose worker stopped heartbeating. Re-queues with backoff, or
-- marks 'dead' once attempts are exhausted. Returns the number of jobs touched.
CREATE OR REPLACE FUNCTION public.requeue_stale_render_jobs(p_stale_after interval)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF p_stale_after IS NULL OR p_stale_after < interval '30 seconds' THEN
    RAISE EXCEPTION 'stale_after must be at least 30 seconds' USING ERRCODE = '22023';
  END IF;

  UPDATE public.render_jobs
  SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
      error = 'worker heartbeat stopped',
      run_after = CASE WHEN attempts >= max_attempts THEN run_after
                       ELSE now() + public.render_job_backoff(attempts) END,
      claimed_by = CASE WHEN attempts >= max_attempts THEN claimed_by ELSE NULL END
  WHERE status IN ('claimed', 'rendering', 'uploading')
    AND heartbeat_at < now() - p_stale_after;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.render_job_backoff(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_render_job(text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_render_job(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_render_job(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_render_job(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_render_job(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.requeue_stale_render_jobs(interval) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.render_job_backoff(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_render_job(text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_render_job(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_render_job(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_render_job(uuid, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_render_job(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_stale_render_jobs(interval) TO service_role;

COMMIT;
