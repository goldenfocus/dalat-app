-- God Mode Support for Moment Uploads
-- Allows superadmins to upload moments on behalf of impersonated users

-- ============================================
-- HELPER FUNCTION: Check if user is superadmin
-- ============================================

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM profiles
  WHERE id = auth.uid();

  RETURN v_role = 'superadmin';
END;
$$;

GRANT EXECUTE ON FUNCTION is_superadmin() TO authenticated;

-- ============================================
-- UPDATE create_moment to support God Mode
-- ============================================

-- Drop and recreate with new signature
DROP FUNCTION IF EXISTS create_moment(uuid, text, text, text);

CREATE OR REPLACE FUNCTION create_moment(
  p_event_id uuid,
  p_content_type text,
  p_media_url text DEFAULT NULL,
  p_text_content text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL  -- Optional: override user ID for God Mode
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid uuid;
  v_effective_uid uuid;
  v_require_approval boolean;
  v_status text;
  v_moment_id uuid;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Determine effective user ID
  -- Only superadmins can override user ID (God Mode)
  IF p_user_id IS NOT NULL AND p_user_id != v_auth_uid THEN
    IF NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'not_allowed_to_override_user';
    END IF;
    v_effective_uid := p_user_id;
  ELSE
    v_effective_uid := v_auth_uid;
  END IF;

  -- Check if authenticated user can post (not effective user)
  IF NOT public.can_post_moment(p_event_id) THEN
    RAISE EXCEPTION 'not_allowed_to_post';
  END IF;

  -- Check if approval is required
  SELECT moments_require_approval
  INTO v_require_approval
  FROM event_settings
  WHERE event_id = p_event_id;

  -- Default to no approval if settings don't exist
  v_status := CASE WHEN COALESCE(v_require_approval, false) THEN 'pending' ELSE 'published' END;

  -- Insert the moment with effective user ID
  INSERT INTO moments (event_id, user_id, content_type, media_url, text_content, status)
  VALUES (p_event_id, v_effective_uid, p_content_type, p_media_url, p_text_content, v_status)
  RETURNING id INTO v_moment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'moment_id', v_moment_id,
    'status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_moment(uuid, text, text, text, uuid) TO authenticated;

-- ============================================
-- UPDATE create_moments_batch to support God Mode
-- ============================================

-- Drop and recreate with new signature
DROP FUNCTION IF EXISTS create_moments_batch(uuid, jsonb);

CREATE OR REPLACE FUNCTION create_moments_batch(
  p_event_id uuid,
  p_moments jsonb,  -- Array of {content_type, media_url, text_content, batch_id}
  p_user_id uuid DEFAULT NULL  -- Optional: override user ID for God Mode
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid uuid;
  v_effective_uid uuid;
  v_status text;
  v_moment_record jsonb;
  v_inserted_ids uuid[] := '{}';
  v_moment_id uuid;
  v_batch_id uuid;
  v_content_type text;
  v_media_url text;
  v_text_content text;
  v_count int := 0;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Determine effective user ID
  -- Only superadmins can override user ID (God Mode)
  IF p_user_id IS NOT NULL AND p_user_id != v_auth_uid THEN
    IF NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'not_allowed_to_override_user';
    END IF;
    v_effective_uid := p_user_id;
  ELSE
    v_effective_uid := v_auth_uid;
  END IF;

  -- Check if authenticated user can batch upload (must be event photographer/creator)
  IF NOT public.is_event_photographer(p_event_id) THEN
    RAISE EXCEPTION 'not_allowed_batch_upload';
  END IF;

  -- Validate array size (max 100 per batch for safety)
  IF jsonb_array_length(p_moments) > 100 THEN
    RAISE EXCEPTION 'batch_too_large';
  END IF;

  -- Pro photographer mode always publishes immediately
  v_status := 'published';

  -- Insert all moments with effective user ID
  FOR v_moment_record IN SELECT * FROM jsonb_array_elements(p_moments)
  LOOP
    v_content_type := v_moment_record->>'content_type';
    v_media_url := v_moment_record->>'media_url';
    v_text_content := v_moment_record->>'text_content';
    v_batch_id := NULLIF(v_moment_record->>'batch_id', '')::uuid;

    -- Validate content type
    IF v_content_type NOT IN ('photo', 'video', 'text') THEN
      RAISE EXCEPTION 'invalid_content_type';
    END IF;

    -- Validate content based on type
    IF v_content_type IN ('photo', 'video') AND v_media_url IS NULL THEN
      RAISE EXCEPTION 'media_url_required';
    END IF;

    INSERT INTO moments (
      event_id,
      user_id,
      content_type,
      media_url,
      text_content,
      status,
      batch_id
    )
    VALUES (
      p_event_id,
      v_effective_uid,  -- Use effective user ID
      v_content_type,
      v_media_url,
      v_text_content,
      v_status,
      v_batch_id
    )
    RETURNING id INTO v_moment_id;

    v_inserted_ids := array_append(v_inserted_ids, v_moment_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'moment_ids', to_jsonb(v_inserted_ids),
    'status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_moments_batch(uuid, jsonb, uuid) TO authenticated;

-- ============================================
-- UPDATE STORAGE POLICY for God Mode
-- ============================================

-- Update the helper function to allow superadmins to upload to any user's folder
CREATE OR REPLACE FUNCTION public.can_upload_moment_media(object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Extract event_id from path and check permission
    public.can_post_moment((storage.foldername(object_name))[1]::uuid)
    AND
    (
      -- Either user is uploading to their own folder
      (storage.foldername(object_name))[2]::uuid = auth.uid()
      OR
      -- Or user is a superadmin (God Mode)
      public.is_superadmin()
    );
$$;
