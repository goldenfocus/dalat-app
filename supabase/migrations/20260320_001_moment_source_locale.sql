-- Add source_locale parameter to create_moment function
-- This ensures moments are tagged with the language they were written in,
-- fixing the "Translated from English" bug when content is written in other languages

-- ============================================
-- UPDATE create_moment to include source_locale
-- ============================================

DROP FUNCTION IF EXISTS create_moment(uuid, text, text, text, uuid);

CREATE OR REPLACE FUNCTION create_moment(
  p_event_id uuid,
  p_content_type text,
  p_media_url text DEFAULT NULL,
  p_text_content text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_source_locale text DEFAULT 'en'
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
  v_valid_locale text;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Validate source_locale (must be one of The Global Twelve)
  v_valid_locale := CASE
    WHEN p_source_locale IN ('en', 'vi', 'ko', 'zh', 'ru', 'fr', 'ja', 'ms', 'th', 'de', 'es', 'id')
    THEN p_source_locale
    ELSE 'en'
  END;

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

  -- Insert the moment with effective user ID and source locale
  INSERT INTO moments (event_id, user_id, content_type, media_url, text_content, status, source_locale)
  VALUES (p_event_id, v_effective_uid, p_content_type, p_media_url, p_text_content, v_status, v_valid_locale)
  RETURNING id INTO v_moment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'moment_id', v_moment_id,
    'status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_moment(uuid, text, text, text, uuid, text) TO authenticated;

-- ============================================
-- UPDATE create_moments_batch to include source_locale
-- ============================================

DROP FUNCTION IF EXISTS create_moments_batch(uuid, jsonb, uuid);

CREATE OR REPLACE FUNCTION create_moments_batch(
  p_event_id uuid,
  p_moments jsonb,
  p_user_id uuid DEFAULT NULL,
  p_source_locale text DEFAULT 'en'
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
  v_valid_locale text;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Validate source_locale
  v_valid_locale := CASE
    WHEN p_source_locale IN ('en', 'vi', 'ko', 'zh', 'ru', 'fr', 'ja', 'ms', 'th', 'de', 'es', 'id')
    THEN p_source_locale
    ELSE 'en'
  END;

  -- Determine effective user ID
  IF p_user_id IS NOT NULL AND p_user_id != v_auth_uid THEN
    IF NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'not_allowed_to_override_user';
    END IF;
    v_effective_uid := p_user_id;
  ELSE
    v_effective_uid := v_auth_uid;
  END IF;

  -- Check if authenticated user can batch upload
  IF NOT public.is_event_photographer(p_event_id) THEN
    RAISE EXCEPTION 'not_allowed_batch_upload';
  END IF;

  -- Check if approval is required
  SELECT moments_require_approval
  INTO v_status
  FROM event_settings
  WHERE event_id = p_event_id;

  v_status := CASE WHEN COALESCE(v_status::boolean, false) THEN 'pending' ELSE 'published' END;

  -- Validate moments array
  IF jsonb_array_length(p_moments) = 0 THEN
    RAISE EXCEPTION 'empty_moments_array';
  END IF;

  IF jsonb_array_length(p_moments) > 100 THEN
    RAISE EXCEPTION 'too_many_moments';
  END IF;

  FOR v_moment_record IN SELECT * FROM jsonb_array_elements(p_moments)
  LOOP
    v_content_type := v_moment_record->>'content_type';
    v_media_url := v_moment_record->>'media_url';
    v_text_content := v_moment_record->>'text_content';
    v_batch_id := COALESCE((v_moment_record->>'batch_id')::uuid, gen_random_uuid());

    IF v_content_type NOT IN ('photo', 'video', 'text') THEN
      RAISE EXCEPTION 'invalid_content_type';
    END IF;

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
      batch_id,
      source_locale
    )
    VALUES (
      p_event_id,
      v_effective_uid,
      v_content_type,
      v_media_url,
      v_text_content,
      v_status,
      v_batch_id,
      v_valid_locale
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

GRANT EXECUTE ON FUNCTION create_moments_batch(uuid, jsonb, uuid, text) TO authenticated;
