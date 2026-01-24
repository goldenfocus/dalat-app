-- Add image display options for events and series
-- image_fit: "cover" (crop to fill) or "contain" (show full image)
-- focal_point: CSS object-position value for focal point when using cover mode

-- Add columns to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS image_fit TEXT NOT NULL DEFAULT 'cover'
  CHECK (image_fit IN ('cover', 'contain')),
ADD COLUMN IF NOT EXISTS focal_point TEXT DEFAULT NULL;

-- Add columns to event_series table
ALTER TABLE event_series
ADD COLUMN IF NOT EXISTS image_fit TEXT NOT NULL DEFAULT 'cover'
  CHECK (image_fit IN ('cover', 'contain')),
ADD COLUMN IF NOT EXISTS focal_point TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN events.image_fit IS 'How the cover image should be displayed: cover (crop to fill) or contain (show full image)';
COMMENT ON COLUMN events.focal_point IS 'CSS object-position value for the focal point when using cover mode, e.g., "50% 80%"';
COMMENT ON COLUMN event_series.image_fit IS 'How the cover image should be displayed: cover (crop to fill) or contain (show full image)';
COMMENT ON COLUMN event_series.focal_point IS 'CSS object-position value for the focal point when using cover mode, e.g., "50% 80%"';
