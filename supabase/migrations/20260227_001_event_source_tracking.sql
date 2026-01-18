-- Add source tracking columns to events table
-- This enables tracking where events were imported from (Facebook, Instagram, TikTok, Eventbrite, etc.)

ALTER TABLE events
ADD COLUMN IF NOT EXISTS source_platform TEXT,
ADD COLUMN IF NOT EXISTS source_metadata JSONB DEFAULT '{}';

-- Add index for querying by platform
CREATE INDEX IF NOT EXISTS idx_events_source_platform ON events(source_platform);

-- Add comments for documentation
COMMENT ON COLUMN events.source_platform IS 'Platform the event was imported from: facebook, instagram, tiktok, eventbrite, meetup, luma, manual';
COMMENT ON COLUMN events.source_metadata IS 'Platform-specific metadata like engagement counts, original IDs, AI extraction info';
