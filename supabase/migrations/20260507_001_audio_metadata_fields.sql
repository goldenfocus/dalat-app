-- Add audio metadata fields to event_materials table
-- These fields store ID3 tag data extracted from audio files (MP3, M4A, etc.)
-- for better display, SEO, and UX

-- Add artist field (from ID3 TPE1/artist tag)
ALTER TABLE event_materials
ADD COLUMN IF NOT EXISTS artist TEXT;

-- Add album field (from ID3 TALB/album tag)
ALTER TABLE event_materials
ADD COLUMN IF NOT EXISTS album TEXT;

-- Add duration in seconds (from audio file analysis)
ALTER TABLE event_materials
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- Add thumbnail URL for album art (stored in storage after extraction)
ALTER TABLE event_materials
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add track number (from ID3 TRCK tag)
ALTER TABLE event_materials
ADD COLUMN IF NOT EXISTS track_number TEXT;

-- Add year/release date (from ID3 TYER/TDRC tag)
ALTER TABLE event_materials
ADD COLUMN IF NOT EXISTS release_year INTEGER;

-- Add genre (from ID3 TCON tag)
ALTER TABLE event_materials
ADD COLUMN IF NOT EXISTS genre TEXT;

-- Index for potential filtering by artist
CREATE INDEX IF NOT EXISTS idx_event_materials_artist ON event_materials(artist) WHERE artist IS NOT NULL;

-- Comment on columns for documentation
COMMENT ON COLUMN event_materials.artist IS 'Artist name extracted from audio file ID3 tags';
COMMENT ON COLUMN event_materials.album IS 'Album name extracted from audio file ID3 tags';
COMMENT ON COLUMN event_materials.duration_seconds IS 'Duration of audio/video file in seconds';
COMMENT ON COLUMN event_materials.thumbnail_url IS 'URL to album art thumbnail extracted from audio file or generated';
COMMENT ON COLUMN event_materials.track_number IS 'Track number from ID3 tags (may include total like "3/12")';
COMMENT ON COLUMN event_materials.release_year IS 'Release year from ID3 tags';
COMMENT ON COLUMN event_materials.genre IS 'Genre from ID3 tags';
