-- ============================================
-- TRACK LYRICS TRANSLATIONS
-- Migration: 20260720_001_track_lyrics_translations
-- ============================================
-- Adds translation support for track lyrics across 12 languages.
-- This enables SEO for lyrics pages in all supported languages.
--
-- The Global Twelve: en, vi, ko, zh, ru, fr, ja, ms, th, de, es, id

-- ============================================
-- SCHEMA CHANGES
-- ============================================

-- Add source_locale to playlist_tracks for tracking original lyrics language
ALTER TABLE playlist_tracks
ADD COLUMN IF NOT EXISTS source_locale text DEFAULT 'vi';

COMMENT ON COLUMN playlist_tracks.source_locale IS
'Original language of the lyrics (default: vi for Vietnamese content)';

-- ============================================
-- UPDATE TRANSLATION CONSTRAINTS
-- ============================================

-- Drop existing content_type constraint and recreate with 'track'
ALTER TABLE content_translations
DROP CONSTRAINT IF EXISTS content_translations_content_type_check;

ALTER TABLE content_translations
ADD CONSTRAINT content_translations_content_type_check
CHECK (content_type IN ('event', 'moment', 'profile', 'blog', 'venue', 'comment', 'organizer', 'track'));

-- Drop existing field_name constraint and recreate with 'lyrics'
ALTER TABLE content_translations
DROP CONSTRAINT IF EXISTS content_translations_field_name_check;

ALTER TABLE content_translations
ADD CONSTRAINT content_translations_field_name_check
CHECK (field_name IN (
  'title', 'description', 'text_content', 'bio',
  'story_content', 'technical_content', 'meta_description',
  'image_alt', 'image_description',
  'ai_description', 'scene_description', 'video_summary',
  'audio_summary', 'pdf_summary',
  'content',
  'lyrics'
));

-- ============================================
-- RLS POLICIES FOR TRACK TRANSLATIONS
-- ============================================

-- Anyone can read track translations (lyrics are public)
-- The existing content_translations policies should handle this,
-- but let's ensure tracks are included

-- Create index for efficient track lyrics lookups
CREATE INDEX IF NOT EXISTS idx_content_translations_track_lyrics
ON content_translations(content_id, target_locale)
WHERE content_type = 'track' AND field_name = 'lyrics';

-- ============================================
-- HELPER FUNCTION
-- ============================================

-- Get translated lyrics for a track
CREATE OR REPLACE FUNCTION get_track_lyrics_translation(
  p_track_id uuid,
  p_target_locale text
)
RETURNS TABLE (
  lyrics text,
  source_locale text,
  is_translated boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_track_id_text text := p_track_id::text;
BEGIN
  -- Try to get translation first, fall back to original
  RETURN QUERY
  SELECT
    COALESCE(
      ct.translated_text,
      pt.lyrics_lrc
    ) AS lyrics,
    COALESCE(pt.source_locale, 'vi') AS source_locale,
    ct.translated_text IS NOT NULL AS is_translated
  FROM playlist_tracks pt
  LEFT JOIN content_translations ct ON
    ct.content_type = 'track'
    AND ct.content_id = v_track_id_text
    AND ct.field_name = 'lyrics'
    AND ct.target_locale = p_target_locale
  WHERE pt.id = p_track_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_track_lyrics_translation(uuid, text) TO anon, authenticated;

COMMENT ON FUNCTION get_track_lyrics_translation IS
'Returns translated lyrics for a track, falling back to original if no translation exists.';
