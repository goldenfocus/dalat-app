-- Backfill youtube_video_id for any YouTube moments that have youtube_url but missing video_id
-- This handles moments created before the migration added proper YouTube support

-- Extract video ID from various YouTube URL formats
UPDATE moments
SET youtube_video_id = (
  CASE
    -- youtube.com/watch?v=VIDEO_ID
    WHEN youtube_url ~ 'youtube\.com/watch\?v=' THEN
      regexp_replace(youtube_url, '.*[?&]v=([^&\s]+).*', '\1')
    -- youtu.be/VIDEO_ID
    WHEN youtube_url ~ 'youtu\.be/' THEN
      regexp_replace(youtube_url, '.*youtu\.be/([^?&\s]+).*', '\1')
    -- youtube.com/embed/VIDEO_ID
    WHEN youtube_url ~ 'youtube\.com/embed/' THEN
      regexp_replace(youtube_url, '.*youtube\.com/embed/([^?&\s]+).*', '\1')
    -- youtube.com/shorts/VIDEO_ID
    WHEN youtube_url ~ 'youtube\.com/shorts/' THEN
      regexp_replace(youtube_url, '.*youtube\.com/shorts/([^?&\s]+).*', '\1')
    -- youtube.com/live/VIDEO_ID
    WHEN youtube_url ~ 'youtube\.com/live/' THEN
      regexp_replace(youtube_url, '.*youtube\.com/live/([^?&\s]+).*', '\1')
    ELSE NULL
  END
)
WHERE content_type = 'youtube'
  AND youtube_url IS NOT NULL
  AND (youtube_video_id IS NULL OR youtube_video_id = '');

-- Log how many were updated
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM moments
  WHERE content_type = 'youtube'
    AND youtube_video_id IS NOT NULL;
  RAISE NOTICE 'YouTube moments with video IDs: %', updated_count;
END $$;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
