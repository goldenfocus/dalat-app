BEGIN;
-- Use the existing caption worker for actual audio transcription, including audio-only moments.
ALTER TABLE public.caption_jobs DROP CONSTRAINT caption_jobs_content_type_check;
ALTER TABLE public.caption_jobs ADD CONSTRAINT caption_jobs_content_type_check
  CHECK (content_type IN ('image', 'video', 'audio', 'recap'));
ALTER TABLE public.caption_jobs DROP CONSTRAINT caption_jobs_owner_check;
ALTER TABLE public.caption_jobs ADD CONSTRAINT caption_jobs_owner_check CHECK (
  (content_type IN ('image', 'video', 'audio') AND moment_id IS NOT NULL AND event_id IS NULL)
  OR (content_type = 'recap' AND event_id IS NOT NULL AND moment_id IS NULL)
);
COMMIT;
