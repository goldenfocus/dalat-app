-- AI Features: Smart Tags & Spam Detection
-- Adds auto-categorization tags and spam scoring to events

-- ============================================
-- SMART TAGS
-- ============================================

-- Add AI tags column (Postgres text array)
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_tags text[] DEFAULT '{}';
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_tags_updated_at timestamptz;

-- GIN index for efficient tag filtering (supports @> operator)
CREATE INDEX IF NOT EXISTS idx_events_ai_tags ON events USING GIN (ai_tags);

-- ============================================
-- SPAM DETECTION
-- ============================================

-- Add spam scoring columns
ALTER TABLE events ADD COLUMN IF NOT EXISTS spam_score float DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS spam_reason text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS spam_checked_at timestamptz;

-- Index for filtering non-spam events (common query pattern)
CREATE INDEX IF NOT EXISTS idx_events_spam_score ON events(spam_score) WHERE spam_score < 0.8;

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Get events by tag (with pagination)
CREATE OR REPLACE FUNCTION get_events_by_tag(
  p_tag text,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS SETOF events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM events
  WHERE status = 'published'
    AND spam_score < 0.8
    AND p_tag = ANY(ai_tags)
    AND starts_at > now() - interval '4 hours'
  ORDER BY starts_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_events_by_tag(text, int, int) TO anon, authenticated;

-- Get all used tags with counts (for filter UI)
CREATE OR REPLACE FUNCTION get_tag_counts()
RETURNS TABLE(tag text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT unnest(ai_tags) as tag, count(*) as count
  FROM events
  WHERE status = 'published'
    AND spam_score < 0.8
    AND starts_at > now() - interval '4 hours'
    AND array_length(ai_tags, 1) > 0
  GROUP BY tag
  ORDER BY count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_tag_counts() TO anon, authenticated;

-- Update event tags (admin only via API, not direct DB access)
CREATE OR REPLACE FUNCTION update_event_tags(
  p_event_id uuid,
  p_tags text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE events
  SET ai_tags = p_tags,
      ai_tags_updated_at = now()
  WHERE id = p_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_event_tags(uuid, text[]) TO authenticated;

-- Update spam score (admin only via API)
CREATE OR REPLACE FUNCTION update_event_spam_score(
  p_event_id uuid,
  p_score float,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE events
  SET spam_score = p_score,
      spam_reason = p_reason,
      spam_checked_at = now()
  WHERE id = p_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_event_spam_score(uuid, float, text) TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN events.ai_tags IS 'AI-generated category tags (music, yoga, food, etc.)';
COMMENT ON COLUMN events.ai_tags_updated_at IS 'When AI tags were last updated';
COMMENT ON COLUMN events.spam_score IS 'AI spam confidence 0-1. Events >0.8 are auto-hidden.';
COMMENT ON COLUMN events.spam_reason IS 'Explanation of spam classification';
COMMENT ON COLUMN events.spam_checked_at IS 'When spam check was last run';
