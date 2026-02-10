-- Fix publish_user_drafts: moments_require_approval is on event_settings, not events
CREATE OR REPLACE FUNCTION publish_user_drafts(
  p_event_id UUID
) RETURNS INT AS $$
DECLARE
  v_count INT;
  v_require_approval BOOLEAN;
  v_new_status TEXT;
BEGIN
  -- Check if event requires moment approval (column is on event_settings, not events)
  SELECT moments_require_approval INTO v_require_approval
  FROM event_settings WHERE event_id = p_event_id;

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
