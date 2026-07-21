-- Fix: captions typed in the bulk upload queue were never persisted.
--
-- The queue path creates drafts via create_moment_draft with p_text_content = NULL
-- (captions are typed AFTER the file finishes uploading), and publish_user_drafts
-- only flipped `status`. The captions lived in React state and were discarded on
-- publish, so text_content stayed NULL for every bulk-uploaded moment.
--
-- A client-side UPDATE is not an option: the moments UPDATE policy
-- (20260119_001_moments_ugc.sql:185) requires status = 'pending', so a user cannot
-- update their own status = 'draft' row at all. Rather than widen RLS, the captions
-- are written here, inside the existing SECURITY DEFINER function that is already
-- scoped to auth.uid(), so captions + publish land in one transaction.
--
-- Body copied verbatim from 20260729_001_fix_publish_user_drafts.sql (which fixed
-- moments_require_approval to read from event_settings, not events) with only the
-- caption write added.

-- Drop the 1-arg version first. Adding a defaulted second parameter would otherwise
-- CREATE a second function rather than replace this one, and calls with a single
-- argument would fail with "function name is not unique".
-- (See 20260627_001_fix_create_moment_overload.sql for the last time this bit us.)
DROP FUNCTION IF EXISTS publish_user_drafts(UUID);

CREATE OR REPLACE FUNCTION publish_user_drafts(
  p_event_id UUID,
  -- { "<moment_id>": "caption", ... } — omitted/blank entries leave text_content as-is
  p_captions JSONB DEFAULT '{}'::jsonb
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

  UPDATE moments AS m
  SET status = v_new_status,
      text_content = COALESCE(
        NULLIF(btrim(p_captions ->> m.id::text), ''),
        m.text_content
      ),
      updated_at = NOW()
  WHERE m.event_id = p_event_id
    AND m.user_id = auth.uid()
    AND m.status = 'draft';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION publish_user_drafts(UUID, JSONB) TO authenticated;
