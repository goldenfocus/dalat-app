-- ============================================
-- Moment AI Metadata Table
-- Stores AI-extracted metadata for SEO flywheel
-- ============================================

-- Create the moment_metadata table
CREATE TABLE IF NOT EXISTS moment_metadata (
  moment_id uuid PRIMARY KEY REFERENCES moments(id) ON DELETE CASCADE,

  -- Common AI fields (all content types)
  ai_description text,           -- AI-generated SEO description
  ai_title text,                 -- AI-suggested title
  ai_tags text[],                -- Extracted keywords/tags
  scene_description text,        -- What's happening in the content
  mood text,                     -- "festive", "calm", "energetic", etc.
  quality_score float,           -- 0-1 for featuring algorithm
  content_language text,         -- Detected primary language

  -- Image-specific fields
  detected_objects text[],       -- ["stage", "crowd", "lights", "banners"]
  detected_text text[],          -- OCR results from image
  detected_faces_count int,      -- Number of faces detected
  dominant_colors text[],        -- ["#FF5722", "#2196F3"]
  location_hints text[],         -- ["outdoor", "cafe", "Da Lat"]

  -- Video-specific fields
  video_transcript text,         -- Speech-to-text from video
  video_summary text,            -- AI summary of video content
  key_frame_urls text[],         -- URLs to extracted key frames
  key_frame_timestamps float[],  -- Timestamps of key frames (seconds)

  -- Audio-specific fields
  audio_transcript text,         -- Speech-to-text from audio
  audio_summary text,            -- AI summary of audio content
  audio_language text,           -- Detected audio language

  -- PDF/Document-specific fields
  pdf_summary text,              -- AI-generated summary
  pdf_extracted_text text,       -- Full text extraction
  pdf_page_count int,            -- Number of pages
  pdf_key_topics text[],         -- Extracted key topics

  -- YouTube-specific (supplement existing metadata)
  youtube_transcript text,       -- Transcript from YouTube captions
  youtube_chapters jsonb,        -- [{title, start_time}]

  -- Processing status
  processing_status text DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  processing_error text,
  processed_at timestamptz,
  processing_duration_ms int,    -- How long processing took

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add comment
COMMENT ON TABLE moment_metadata IS 'AI-extracted metadata for moments, used for SEO and search';

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_moment_metadata_tags ON moment_metadata USING GIN (ai_tags);
CREATE INDEX IF NOT EXISTS idx_moment_metadata_objects ON moment_metadata USING GIN (detected_objects);
CREATE INDEX IF NOT EXISTS idx_moment_metadata_status ON moment_metadata(processing_status);
CREATE INDEX IF NOT EXISTS idx_moment_metadata_quality ON moment_metadata(quality_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_moment_metadata_mood ON moment_metadata(mood) WHERE mood IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER moment_metadata_updated_at
  BEFORE UPDATE ON moment_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Update content_translations for AI fields
-- ============================================

-- Drop and recreate the constraint to add new AI field names
ALTER TABLE content_translations
DROP CONSTRAINT IF EXISTS content_translations_field_name_check;

ALTER TABLE content_translations
ADD CONSTRAINT content_translations_field_name_check
CHECK (field_name IN (
  -- Existing fields
  'title', 'description', 'text_content', 'bio',
  'story_content', 'technical_content', 'meta_description',
  'image_alt', 'image_description',
  -- New AI metadata fields for translation
  'ai_description', 'scene_description', 'video_summary',
  'audio_summary', 'pdf_summary'
));

-- ============================================
-- Add SEO fields to moments table
-- ============================================

-- Add SEO-focused columns to moments table
ALTER TABLE moments
ADD COLUMN IF NOT EXISTS seo_title text,
ADD COLUMN IF NOT EXISTS seo_description text,
ADD COLUMN IF NOT EXISTS featured_priority int DEFAULT 0,
ADD COLUMN IF NOT EXISTS view_count int DEFAULT 0;

-- Index for featured moments
CREATE INDEX IF NOT EXISTS idx_moments_featured ON moments(featured_priority DESC, created_at DESC)
  WHERE status = 'published' AND featured_priority > 0;

-- Index for view count (for trending/popular)
CREATE INDEX IF NOT EXISTS idx_moments_view_count ON moments(view_count DESC)
  WHERE status = 'published';

-- ============================================
-- RPC: Get moment with AI metadata
-- ============================================

CREATE OR REPLACE FUNCTION get_moment_with_metadata(p_moment_id uuid)
RETURNS TABLE (
  -- Moment fields
  id uuid,
  event_id uuid,
  user_id uuid,
  content_type text,
  media_url text,
  thumbnail_url text,
  text_content text,
  status text,
  created_at timestamptz,
  -- Profile fields
  username text,
  display_name text,
  avatar_url text,
  -- Event fields
  event_slug text,
  event_title text,
  event_image_url text,
  event_starts_at timestamptz,
  event_location_name text,
  -- AI Metadata fields
  ai_description text,
  ai_title text,
  ai_tags text[],
  scene_description text,
  mood text,
  quality_score float,
  detected_objects text[],
  detected_text text[],
  detected_faces_count int,
  dominant_colors text[],
  video_transcript text,
  video_summary text,
  audio_transcript text,
  pdf_summary text,
  processing_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.event_id,
    m.user_id,
    m.content_type,
    m.media_url,
    m.thumbnail_url,
    m.text_content,
    m.status,
    m.created_at,
    p.username,
    p.display_name,
    p.avatar_url,
    e.slug as event_slug,
    e.title as event_title,
    e.image_url as event_image_url,
    e.starts_at as event_starts_at,
    e.location_name as event_location_name,
    mm.ai_description,
    mm.ai_title,
    mm.ai_tags,
    mm.scene_description,
    mm.mood,
    mm.quality_score,
    mm.detected_objects,
    mm.detected_text,
    mm.detected_faces_count,
    mm.dominant_colors,
    mm.video_transcript,
    mm.video_summary,
    mm.audio_transcript,
    mm.pdf_summary,
    mm.processing_status
  FROM moments m
  JOIN profiles p ON p.id = m.user_id
  JOIN events e ON e.id = m.event_id
  LEFT JOIN moment_metadata mm ON mm.moment_id = m.id
  WHERE m.id = p_moment_id;
$$;

-- ============================================
-- RPC: Get moments for homepage strip
-- ============================================

CREATE OR REPLACE FUNCTION get_homepage_moments_strip(
  p_user_id uuid DEFAULT NULL,
  p_limit int DEFAULT 12
)
RETURNS TABLE (
  id uuid,
  media_url text,
  thumbnail_url text,
  content_type text,
  event_slug text,
  event_title text,
  event_image_url text,
  user_avatar_url text,
  username text,
  display_name text,
  created_at timestamptz,
  quality_score float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (m.event_id)
    m.id,
    m.media_url,
    m.thumbnail_url,
    m.content_type,
    e.slug as event_slug,
    e.title as event_title,
    e.image_url as event_image_url,
    p.avatar_url as user_avatar_url,
    p.username,
    p.display_name,
    m.created_at,
    COALESCE(mm.quality_score, 0.5) as quality_score
  FROM moments m
  JOIN events e ON e.id = m.event_id
  JOIN profiles p ON p.id = m.user_id
  LEFT JOIN moment_metadata mm ON mm.moment_id = m.id
  LEFT JOIN rsvps r ON r.event_id = m.event_id AND r.user_id = p_user_id
  WHERE m.status = 'published'
    AND m.content_type IN ('photo', 'video', 'image')
    AND (m.media_url IS NOT NULL OR m.thumbnail_url IS NOT NULL)
    AND e.status = 'published'
    AND e.starts_at < now() -- Past events only
  ORDER BY
    m.event_id,
    -- Prioritize events user attended
    CASE WHEN r.user_id IS NOT NULL AND r.status = 'going' THEN 0 ELSE 1 END,
    -- Then by quality score
    COALESCE(mm.quality_score, 0.5) DESC,
    m.created_at DESC
  LIMIT p_limit;
$$;

-- ============================================
-- RPC: Get user's recent events for upload
-- ============================================

CREATE OR REPLACE FUNCTION get_user_recent_events_for_upload(
  p_user_id uuid,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  image_url text,
  starts_at timestamptz,
  location_name text,
  can_post_moments boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.slug,
    e.title,
    e.image_url,
    e.starts_at,
    e.location_name,
    -- Check if user can post moments
    CASE
      WHEN es.moments_enabled = false THEN false
      WHEN es.moments_who_can_post = 'anyone' THEN true
      WHEN es.moments_who_can_post = 'rsvp' AND r.status IN ('going', 'interested', 'waitlist') THEN true
      WHEN es.moments_who_can_post = 'confirmed' AND r.status = 'going' THEN true
      WHEN e.created_by = p_user_id THEN true
      ELSE false
    END as can_post_moments
  FROM events e
  LEFT JOIN rsvps r ON r.event_id = e.id AND r.user_id = p_user_id
  LEFT JOIN event_settings es ON es.event_id = e.id
  WHERE e.status = 'published'
    AND (
      -- Events user RSVP'd to in last 30 days
      (r.user_id = p_user_id AND r.status IN ('going', 'interested') AND e.starts_at > now() - interval '30 days')
      OR
      -- Events user created
      e.created_by = p_user_id
    )
  ORDER BY
    -- Prioritize events that just happened
    CASE WHEN e.starts_at < now() THEN 0 ELSE 1 END,
    ABS(EXTRACT(EPOCH FROM (e.starts_at - now()))) ASC
  LIMIT p_limit;
$$;

-- ============================================
-- RPC: Upsert moment metadata
-- ============================================

CREATE OR REPLACE FUNCTION upsert_moment_metadata(
  p_moment_id uuid,
  p_ai_description text DEFAULT NULL,
  p_ai_title text DEFAULT NULL,
  p_ai_tags text[] DEFAULT NULL,
  p_scene_description text DEFAULT NULL,
  p_mood text DEFAULT NULL,
  p_quality_score float DEFAULT NULL,
  p_content_language text DEFAULT NULL,
  p_detected_objects text[] DEFAULT NULL,
  p_detected_text text[] DEFAULT NULL,
  p_detected_faces_count int DEFAULT NULL,
  p_dominant_colors text[] DEFAULT NULL,
  p_location_hints text[] DEFAULT NULL,
  p_video_transcript text DEFAULT NULL,
  p_video_summary text DEFAULT NULL,
  p_key_frame_urls text[] DEFAULT NULL,
  p_audio_transcript text DEFAULT NULL,
  p_audio_summary text DEFAULT NULL,
  p_audio_language text DEFAULT NULL,
  p_pdf_summary text DEFAULT NULL,
  p_pdf_extracted_text text DEFAULT NULL,
  p_pdf_page_count int DEFAULT NULL,
  p_pdf_key_topics text[] DEFAULT NULL,
  p_processing_status text DEFAULT 'completed',
  p_processing_error text DEFAULT NULL,
  p_processing_duration_ms int DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO moment_metadata (
    moment_id,
    ai_description,
    ai_title,
    ai_tags,
    scene_description,
    mood,
    quality_score,
    content_language,
    detected_objects,
    detected_text,
    detected_faces_count,
    dominant_colors,
    location_hints,
    video_transcript,
    video_summary,
    key_frame_urls,
    audio_transcript,
    audio_summary,
    audio_language,
    pdf_summary,
    pdf_extracted_text,
    pdf_page_count,
    pdf_key_topics,
    processing_status,
    processing_error,
    processing_duration_ms,
    processed_at
  )
  VALUES (
    p_moment_id,
    p_ai_description,
    p_ai_title,
    p_ai_tags,
    p_scene_description,
    p_mood,
    p_quality_score,
    p_content_language,
    p_detected_objects,
    p_detected_text,
    p_detected_faces_count,
    p_dominant_colors,
    p_location_hints,
    p_video_transcript,
    p_video_summary,
    p_key_frame_urls,
    p_audio_transcript,
    p_audio_summary,
    p_audio_language,
    p_pdf_summary,
    p_pdf_extracted_text,
    p_pdf_page_count,
    p_pdf_key_topics,
    p_processing_status,
    p_processing_error,
    p_processing_duration_ms,
    CASE WHEN p_processing_status IN ('completed', 'failed') THEN now() ELSE NULL END
  )
  ON CONFLICT (moment_id) DO UPDATE SET
    ai_description = COALESCE(EXCLUDED.ai_description, moment_metadata.ai_description),
    ai_title = COALESCE(EXCLUDED.ai_title, moment_metadata.ai_title),
    ai_tags = COALESCE(EXCLUDED.ai_tags, moment_metadata.ai_tags),
    scene_description = COALESCE(EXCLUDED.scene_description, moment_metadata.scene_description),
    mood = COALESCE(EXCLUDED.mood, moment_metadata.mood),
    quality_score = COALESCE(EXCLUDED.quality_score, moment_metadata.quality_score),
    content_language = COALESCE(EXCLUDED.content_language, moment_metadata.content_language),
    detected_objects = COALESCE(EXCLUDED.detected_objects, moment_metadata.detected_objects),
    detected_text = COALESCE(EXCLUDED.detected_text, moment_metadata.detected_text),
    detected_faces_count = COALESCE(EXCLUDED.detected_faces_count, moment_metadata.detected_faces_count),
    dominant_colors = COALESCE(EXCLUDED.dominant_colors, moment_metadata.dominant_colors),
    location_hints = COALESCE(EXCLUDED.location_hints, moment_metadata.location_hints),
    video_transcript = COALESCE(EXCLUDED.video_transcript, moment_metadata.video_transcript),
    video_summary = COALESCE(EXCLUDED.video_summary, moment_metadata.video_summary),
    key_frame_urls = COALESCE(EXCLUDED.key_frame_urls, moment_metadata.key_frame_urls),
    audio_transcript = COALESCE(EXCLUDED.audio_transcript, moment_metadata.audio_transcript),
    audio_summary = COALESCE(EXCLUDED.audio_summary, moment_metadata.audio_summary),
    audio_language = COALESCE(EXCLUDED.audio_language, moment_metadata.audio_language),
    pdf_summary = COALESCE(EXCLUDED.pdf_summary, moment_metadata.pdf_summary),
    pdf_extracted_text = COALESCE(EXCLUDED.pdf_extracted_text, moment_metadata.pdf_extracted_text),
    pdf_page_count = COALESCE(EXCLUDED.pdf_page_count, moment_metadata.pdf_page_count),
    pdf_key_topics = COALESCE(EXCLUDED.pdf_key_topics, moment_metadata.pdf_key_topics),
    processing_status = EXCLUDED.processing_status,
    processing_error = EXCLUDED.processing_error,
    processing_duration_ms = EXCLUDED.processing_duration_ms,
    processed_at = CASE WHEN EXCLUDED.processing_status IN ('completed', 'failed') THEN now() ELSE moment_metadata.processed_at END,
    updated_at = now();

  RETURN p_moment_id;
END;
$$;

-- ============================================
-- RLS Policies for moment_metadata
-- ============================================

ALTER TABLE moment_metadata ENABLE ROW LEVEL SECURITY;

-- Anyone can read metadata for published moments
CREATE POLICY "Anyone can read metadata for published moments"
  ON moment_metadata FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM moments m
      WHERE m.id = moment_metadata.moment_id
      AND m.status = 'published'
    )
  );

-- Service role can insert/update (for background jobs)
CREATE POLICY "Service role can manage metadata"
  ON moment_metadata FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Grant permissions
GRANT SELECT ON moment_metadata TO authenticated, anon;
GRANT ALL ON moment_metadata TO service_role;
