-- Online Events & Title Positioning
-- Adds support for virtual/online events and customizable title position on flyers

-- ============================================
-- Add is_online and online_link to events
-- ============================================
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_link text;

-- Add title_position for flyer customization
-- 'bottom' is default to match current behavior
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS title_position text DEFAULT 'bottom'
    CHECK (title_position IN ('top', 'middle', 'bottom'));

-- ============================================
-- Add same fields to event_series for recurring events
-- ============================================
ALTER TABLE event_series
  ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_link text,
  ADD COLUMN IF NOT EXISTS title_position text DEFAULT 'bottom'
    CHECK (title_position IN ('top', 'middle', 'bottom'));

-- ============================================
-- Index for filtering online events
-- ============================================
CREATE INDEX IF NOT EXISTS idx_events_is_online ON events(is_online) WHERE is_online = true;

-- ============================================
-- Comment documentation
-- ============================================
COMMENT ON COLUMN events.is_online IS 'True if this is an online/virtual event';
COMMENT ON COLUMN events.online_link IS 'Meeting URL (Zoom, Google Meet, etc.) for online events';
COMMENT ON COLUMN events.title_position IS 'Where the title appears on the event flyer: top, middle, or bottom';

COMMENT ON COLUMN event_series.is_online IS 'True if this series is for online/virtual events';
COMMENT ON COLUMN event_series.online_link IS 'Meeting URL template for online event series';
COMMENT ON COLUMN event_series.title_position IS 'Where the title appears on the event flyer: top, middle, or bottom';
