-- Allow comments on experience photos through the shared comment RPCs.
CREATE OR REPLACE FUNCTION public.create_comment(p_target_type text, p_target_id uuid, p_content text, p_parent_id uuid DEFAULT NULL::uuid, p_source_locale text DEFAULT 'en'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_comment_id uuid;
  v_parent_target_type text;
  v_parent_target_id uuid;
  v_content_owner_id uuid;
  v_parent_author_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Validate content length
  IF char_length(p_content) < 1 OR char_length(p_content) > 2000 THEN
    RAISE EXCEPTION 'invalid_content_length';
  END IF;

  -- Validate target type
  IF p_target_type NOT IN ('event', 'moment', 'experience_media') THEN
    RAISE EXCEPTION 'invalid_target_type';
  END IF;

  -- Validate target exists and get owner
  IF p_target_type = 'event' THEN
    SELECT created_by INTO v_content_owner_id
    FROM events WHERE id = p_target_id AND status = 'published';
    IF v_content_owner_id IS NULL THEN
      RAISE EXCEPTION 'target_not_found';
    END IF;
  ELSIF p_target_type = 'moment' THEN
    SELECT user_id INTO v_content_owner_id
    FROM moments WHERE id = p_target_id AND status = 'published';
    IF v_content_owner_id IS NULL THEN
      RAISE EXCEPTION 'target_not_found';
    END IF;
  ELSIF p_target_type = 'experience_media' THEN
    SELECT e.author_id INTO v_content_owner_id
    FROM experience_media m JOIN experiences e ON e.id = m.experience_id
    WHERE m.id = p_target_id AND e.status = 'published';
    IF v_content_owner_id IS NULL THEN
      RAISE EXCEPTION 'target_not_found';
    END IF;
  END IF;

  -- If replying, validate parent
  IF p_parent_id IS NOT NULL THEN
    SELECT target_type, target_id, user_id
    INTO v_parent_target_type, v_parent_target_id, v_parent_author_id
    FROM comments
    WHERE id = p_parent_id
      AND parent_id IS NULL  -- Must be top-level
      AND NOT is_deleted;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'parent_not_found';
    END IF;

    -- Ensure reply is to same target
    IF v_parent_target_type != p_target_type OR v_parent_target_id != p_target_id THEN
      RAISE EXCEPTION 'parent_target_mismatch';
    END IF;
  END IF;

  -- Insert comment
  INSERT INTO comments (
    target_type,
    target_id,
    parent_id,
    user_id,
    content,
    source_locale
  ) VALUES (
    p_target_type,
    p_target_id,
    p_parent_id,
    v_uid,
    p_content,
    p_source_locale
  )
  RETURNING id INTO v_comment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'comment_id', v_comment_id,
    'is_reply', p_parent_id IS NOT NULL,
    'content_owner_id', v_content_owner_id,
    'parent_author_id', v_parent_author_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_moderate_comments(p_target_type text, p_target_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF is_admin() THEN
    RETURN true;
  END IF;
  IF p_target_type = 'event' THEN
    RETURN EXISTS (SELECT 1 FROM events WHERE id = p_target_id AND created_by = auth.uid());
  END IF;
  IF p_target_type = 'moment' THEN
    RETURN EXISTS (SELECT 1 FROM moments WHERE id = p_target_id AND user_id = auth.uid());
  END IF;
  IF p_target_type = 'experience_media' THEN
    RETURN EXISTS (
      SELECT 1 FROM experience_media m JOIN experiences e ON e.id = m.experience_id
      WHERE m.id = p_target_id AND e.author_id = auth.uid());
  END IF;
  RETURN false;
END;
$function$;
