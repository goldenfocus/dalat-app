-- Update create_moments_batch to include file_hash for duplicate detection

DROP FUNCTION IF EXISTS create_moments_batch(uuid, jsonb, uuid, text);

CREATE OR REPLACE FUNCTION create_moments_batch(
  p_event_id uuid,
  p_moments jsonb,
  p_effective_user_id uuid DEFAULT NULL,
  p_source_locale text DEFAULT 'en'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_event_creator_id uuid;
  v_moments_enabled boolean;
  v_moments_who_can_post text;
  v_moments_require_approval boolean;
  v_status text;
  v_batch_id uuid;
  v_moment_count int := 0;
  v_moment_ids uuid[] := '{}';
  v_has_rsvp boolean;
  v_rsvp_status text;
BEGIN
  -- Determine user: use p_effective_user_id if provided by a superadmin (God Mode), otherwise auth.uid()
  IF p_effective_user_id IS NOT NULL THEN
    -- Verify caller is a superadmin
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'superadmin'
    ) THEN
      RAISE EXCEPTION 'Only superadmins can post on behalf of others';
    END IF;
    v_user_id := p_effective_user_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get event creator (events table has created_by, not creator_id)
  SELECT created_by INTO v_event_creator_id
  FROM events
  WHERE id = p_event_id;

  IF v_event_creator_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Get moments settings from event_settings table (with defaults if not found)
  SELECT
    COALESCE(es.moments_enabled, true),
    COALESCE(es.moments_who_can_post, 'anyone'),
    COALESCE(es.moments_require_approval, false)
  INTO v_moments_enabled, v_moments_who_can_post, v_moments_require_approval
  FROM event_settings es
  WHERE es.event_id = p_event_id;

  -- If no settings exist, use defaults
  IF NOT FOUND THEN
    v_moments_enabled := true;
    v_moments_who_can_post := 'anyone';
    v_moments_require_approval := false;
  END IF;

  -- Check if moments are enabled
  IF NOT v_moments_enabled THEN
    RAISE EXCEPTION 'moments_disabled';
  END IF;

  -- Get user's RSVP status for this event (table is rsvps, column is status)
  SELECT status INTO v_rsvp_status
  FROM rsvps
  WHERE event_id = p_event_id AND user_id = v_user_id;

  v_has_rsvp := v_rsvp_status IS NOT NULL;

  -- Check posting permission
  IF v_moments_who_can_post = 'rsvp' THEN
    IF NOT v_has_rsvp AND v_event_creator_id != v_user_id THEN
      RAISE EXCEPTION 'not_allowed_to_post';
    END IF;
  ELSIF v_moments_who_can_post = 'confirmed' THEN
    IF v_rsvp_status != 'going' AND v_event_creator_id != v_user_id THEN
      RAISE EXCEPTION 'not_allowed_to_post';
    END IF;
  END IF;

  -- Determine initial status
  IF v_moments_require_approval AND v_event_creator_id != v_user_id THEN
    v_status := 'pending';
  ELSE
    v_status := 'published';
  END IF;

  -- Generate batch ID
  v_batch_id := gen_random_uuid();

  -- Insert all moments in the batch (including file_hash for duplicate detection)
  WITH inserted AS (
    INSERT INTO moments (
      event_id,
      user_id,
      content_type,
      media_url,
      text_content,
      status,
      batch_id,
      source_locale,
      thumbnail_url,
      cf_video_uid,
      cf_playback_url,
      video_status,
      file_hash
    )
    SELECT
      p_event_id,
      v_user_id,
      (m->>'content_type')::text,
      m->>'media_url',
      m->>'text_content',
      v_status,
      v_batch_id,
      COALESCE(m->>'source_locale', p_source_locale),
      m->>'thumbnail_url',
      m->>'cf_video_uid',
      m->>'cf_playback_url',
      COALESCE(m->>'video_status', 'ready'),
      m->>'file_hash'
    FROM jsonb_array_elements(p_moments) AS m
    RETURNING id
  )
  SELECT array_agg(id), count(*) INTO v_moment_ids, v_moment_count FROM inserted;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'moment_ids', v_moment_ids,
    'count', v_moment_count,
    'status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_moments_batch(uuid, jsonb, uuid, text) TO authenticated;

-- Also update create_moment to support file_hash
DROP FUNCTION IF EXISTS create_moment(uuid, text, text, text, uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION create_moment(
  p_event_id uuid,
  p_content_type text,
  p_media_url text DEFAULT NULL,
  p_text_content text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_source_locale text DEFAULT 'en',
  p_thumbnail_url text DEFAULT NULL,
  p_cf_video_uid text DEFAULT NULL,
  p_cf_playback_url text DEFAULT NULL,
  p_video_status text DEFAULT 'ready',
  p_file_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_event_creator_id uuid;
  v_moments_enabled boolean;
  v_moments_who_can_post text;
  v_moments_require_approval boolean;
  v_moment_id uuid;
  v_status text;
  v_has_rsvp boolean;
  v_rsvp_status text;
BEGIN
  -- Determine user: use p_user_id if provided by a superadmin (God Mode), otherwise auth.uid()
  IF p_user_id IS NOT NULL THEN
    -- Verify caller is a superadmin
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'superadmin'
    ) THEN
      RAISE EXCEPTION 'Only superadmins can post on behalf of others';
    END IF;
    v_user_id := p_user_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get event creator (events table has created_by, not creator_id)
  SELECT created_by INTO v_event_creator_id
  FROM events
  WHERE id = p_event_id;

  IF v_event_creator_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Get moments settings from event_settings table (with defaults if not found)
  SELECT
    COALESCE(es.moments_enabled, true),
    COALESCE(es.moments_who_can_post, 'anyone'),
    COALESCE(es.moments_require_approval, false)
  INTO v_moments_enabled, v_moments_who_can_post, v_moments_require_approval
  FROM event_settings es
  WHERE es.event_id = p_event_id;

  -- If no settings exist, use defaults
  IF NOT FOUND THEN
    v_moments_enabled := true;
    v_moments_who_can_post := 'anyone';
    v_moments_require_approval := false;
  END IF;

  -- Check if moments are enabled
  IF NOT v_moments_enabled THEN
    RAISE EXCEPTION 'moments_disabled';
  END IF;

  -- Get user's RSVP status for this event (table is rsvps, column is status)
  SELECT status INTO v_rsvp_status
  FROM rsvps
  WHERE event_id = p_event_id AND user_id = v_user_id;

  v_has_rsvp := v_rsvp_status IS NOT NULL;

  -- Check posting permission
  IF v_moments_who_can_post = 'rsvp' THEN
    -- User must have any RSVP or be the creator
    IF NOT v_has_rsvp AND v_event_creator_id != v_user_id THEN
      RAISE EXCEPTION 'not_allowed_to_post';
    END IF;
  ELSIF v_moments_who_can_post = 'confirmed' THEN
    -- User must have 'going' status or be the creator
    IF v_rsvp_status != 'going' AND v_event_creator_id != v_user_id THEN
      RAISE EXCEPTION 'not_allowed_to_post';
    END IF;
  END IF;
  -- 'anyone' allows all authenticated users

  -- Determine initial status
  IF v_moments_require_approval AND v_event_creator_id != v_user_id THEN
    v_status := 'pending';
  ELSE
    v_status := 'published';
  END IF;

  -- Create the moment
  INSERT INTO moments (
    event_id, user_id, content_type, media_url, text_content, status,
    source_locale, thumbnail_url, cf_video_uid, cf_playback_url, video_status, file_hash
  )
  VALUES (
    p_event_id, v_user_id, p_content_type, p_media_url, p_text_content, v_status,
    p_source_locale, p_thumbnail_url, p_cf_video_uid, p_cf_playback_url, p_video_status, p_file_hash
  )
  RETURNING id INTO v_moment_id;

  RETURN jsonb_build_object(
    'moment_id', v_moment_id,
    'status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_moment(uuid, text, text, text, uuid, text, text, text, text, text, text) TO authenticated;
