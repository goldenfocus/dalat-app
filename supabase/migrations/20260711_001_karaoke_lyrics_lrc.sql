-- ============================================
-- Add lyrics_lrc column for karaoke feature
-- ============================================
--
-- This migration adds a column to store LRC-formatted lyrics with timestamps
-- for karaoke-style word-by-word synchronization.
--
-- LRC format example:
-- [00:00.00]Xin chào các bạn
-- [00:05.20]Hôm nay trời đẹp quá
--

-- Add lyrics_lrc column to moment_metadata
ALTER TABLE moment_metadata
ADD COLUMN IF NOT EXISTS lyrics_lrc text;

COMMENT ON COLUMN moment_metadata.lyrics_lrc IS 'LRC-formatted lyrics with timestamps for karaoke display';

-- Add lyrics_lrc column to event_materials (for playlist audio tracks)
ALTER TABLE event_materials
ADD COLUMN IF NOT EXISTS lyrics_lrc text;

COMMENT ON COLUMN event_materials.lyrics_lrc IS 'LRC-formatted lyrics with timestamps for karaoke display';

-- ============================================
-- Update upsert_moment_metadata RPC
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
  p_lyrics_lrc text DEFAULT NULL,  -- NEW: LRC format lyrics
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
    lyrics_lrc,
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
    p_lyrics_lrc,
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
    lyrics_lrc = COALESCE(EXCLUDED.lyrics_lrc, moment_metadata.lyrics_lrc),
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
