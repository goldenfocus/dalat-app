-- Add 'draft' status for auto-save uploads
-- Drafts are saved immediately when files upload, before user clicks "Publish"

-- 1. Drop old constraint and add new one with 'draft' status
ALTER TABLE moments DROP CONSTRAINT IF EXISTS moments_status_check;

-- Try to drop by finding the constraint name (Supabase may have auto-generated name)
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE rel.relname = 'moments'
    AND nsp.nspname = 'public'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE moments DROP CONSTRAINT ' || constraint_name;
  END IF;
END $$;

-- Add new constraint with draft status
ALTER TABLE moments ADD CONSTRAINT moments_status_check
  CHECK (status IN ('draft', 'pending', 'published', 'rejected', 'removed'));

-- 2. Index for efficient draft queries (user's drafts for an event)
CREATE INDEX IF NOT EXISTS idx_moments_user_drafts
  ON moments(user_id, event_id)
  WHERE status = 'draft';

-- 3. Create RPC: Save single upload immediately as draft
CREATE OR REPLACE FUNCTION create_moment_draft(
  p_event_id UUID,
  p_media_url TEXT,
  p_media_type TEXT,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_text_content TEXT DEFAULT NULL,
  p_taken_at TIMESTAMPTZ DEFAULT NULL,
  p_video_duration FLOAT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_moment_id UUID;
BEGIN
  INSERT INTO moments (
    event_id, user_id, media_url, media_type, thumbnail_url,
    text_content, taken_at, video_duration, status
  ) VALUES (
    p_event_id, auth.uid(), p_media_url, p_media_type, p_thumbnail_url,
    p_text_content, p_taken_at, p_video_duration, 'draft'
  ) RETURNING id INTO v_moment_id;

  RETURN v_moment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create RPC: Publish all drafts for an event (bulk operation)
CREATE OR REPLACE FUNCTION publish_user_drafts(
  p_event_id UUID
) RETURNS INT AS $$
DECLARE
  v_count INT;
  v_require_approval BOOLEAN;
  v_new_status TEXT;
BEGIN
  -- Check if event requires moment approval
  SELECT moments_require_approval INTO v_require_approval
  FROM events WHERE id = p_event_id;

  -- If approval required, go to 'pending', else 'published'
  v_new_status := CASE WHEN COALESCE(v_require_approval, false) THEN 'pending' ELSE 'published' END;

  UPDATE moments
  SET status = v_new_status,
      updated_at = NOW()
  WHERE event_id = p_event_id
    AND user_id = auth.uid()
    AND status = 'draft';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create RPC: Fetch user's drafts for an event
CREATE OR REPLACE FUNCTION get_user_drafts(
  p_event_id UUID
) RETURNS TABLE (
  id UUID,
  media_url TEXT,
  media_type TEXT,
  thumbnail_url TEXT,
  text_content TEXT,
  taken_at TIMESTAMPTZ,
  video_duration FLOAT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.media_url, m.media_type, m.thumbnail_url,
         m.text_content, m.taken_at, m.video_duration, m.created_at
  FROM moments m
  WHERE m.event_id = p_event_id
    AND m.user_id = auth.uid()
    AND m.status = 'draft'
  ORDER BY m.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create RPC: Delete specific drafts
CREATE OR REPLACE FUNCTION delete_user_drafts(
  p_moment_ids UUID[]
) RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM moments
  WHERE id = ANY(p_moment_ids)
    AND user_id = auth.uid()
    AND status = 'draft';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create RPC: Count user's drafts for an event (for UI indicators)
CREATE OR REPLACE FUNCTION count_user_drafts(
  p_event_id UUID
) RETURNS INT AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INT
    FROM moments
    WHERE event_id = p_event_id
      AND user_id = auth.uid()
      AND status = 'draft'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
