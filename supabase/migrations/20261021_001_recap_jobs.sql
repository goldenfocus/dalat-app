-- Recap jobs ride the existing caption_jobs queue (same worker, same
-- claim/complete/fail contract). A recap job is per-EVENT, not per-moment.
-- Also: blog_posts learns which event a recap belongs to, and when the
-- recap was approved for display on the event page. Recap posts stay
-- status='draft' forever — every public blog surface filters
-- status='published', so draft = storage-only by construction.

-- 1. caption_jobs: allow per-event recap jobs
ALTER TABLE caption_jobs ALTER COLUMN moment_id DROP NOT NULL;

ALTER TABLE caption_jobs
  ADD COLUMN event_id uuid REFERENCES events(id) ON DELETE CASCADE;

-- Drop the existing content_type CHECK regardless of its auto-generated name
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'caption_jobs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%content_type%'
  LOOP
    EXECUTE format('ALTER TABLE caption_jobs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE caption_jobs
  ADD CONSTRAINT caption_jobs_content_type_check
  CHECK (content_type IN ('image', 'video', 'recap'));

-- Exactly one owner per job: moments own image/video jobs, events own recaps
ALTER TABLE caption_jobs
  ADD CONSTRAINT caption_jobs_owner_check
  CHECK (
    (content_type IN ('image', 'video') AND moment_id IS NOT NULL AND event_id IS NULL)
    OR
    (content_type = 'recap' AND event_id IS NOT NULL AND moment_id IS NULL)
  );

-- One recap job per event (regenerate = the enqueue route deletes the old row first)
CREATE UNIQUE INDEX caption_jobs_event_recap_uniq
  ON caption_jobs (event_id)
  WHERE content_type = 'recap';

-- 2. blog_posts: link recap posts to their event + approval timestamp.
-- Full UNIQUE (not partial) so PostgREST upsert onConflict:'event_id' works;
-- NULL rows (all normal posts) never conflict with each other.
ALTER TABLE blog_posts
  ADD COLUMN event_id uuid UNIQUE REFERENCES events(id) ON DELETE CASCADE;

ALTER TABLE blog_posts
  ADD COLUMN recap_published_at timestamptz;

COMMENT ON COLUMN blog_posts.event_id IS
  'Set only for event-recap posts. Recap posts stay status=draft (storage-only); recap_published_at gates rendering on the event page.';
