-- Import queue: decouples scraping (Vercel, free) from AI extraction
-- (Mac mini worker on Claude subscription — zero marginal cost).
-- Design: docs/superpowers/specs/2026-07-09-zero-cost-scraping-design.md
--
-- `type` accepts url/image/text from day one so phase-2 community poster
-- submissions are a drop-in, not a migration.

CREATE TABLE IF NOT EXISTS import_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  type text NOT NULL DEFAULT 'url' CHECK (type IN ('url', 'image', 'text')),
  source_uid text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  -- Idempotent enqueue: re-scraping the same article can never double-queue
  CONSTRAINT import_queue_source_uid_unique UNIQUE (source, source_uid)
);

-- Worker claims by status, health-check watches backlog age
CREATE INDEX IF NOT EXISTS idx_import_queue_status_created
  ON import_queue (status, created_at);

-- Service-role only: RLS enabled with NO policies. Phase 2 (community
-- submissions) adds an authenticated INSERT policy.
ALTER TABLE import_queue ENABLE ROW LEVEL SECURITY;
