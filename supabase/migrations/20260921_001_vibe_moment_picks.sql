-- Lets organizers pin specific moments to the "Vibes from last time" section
-- on the event page. If null/empty, falls back to auto-selection.
ALTER TABLE events ADD COLUMN IF NOT EXISTS vibe_moment_ids UUID[] DEFAULT NULL;
