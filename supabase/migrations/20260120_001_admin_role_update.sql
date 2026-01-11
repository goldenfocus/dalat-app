-- Admin Role Update Function
-- Allows admins to change user roles securely via RPC
-- This bypasses RLS safely by checking admin status internally

CREATE OR REPLACE FUNCTION admin_update_user_role(
  p_user_id uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_target_role text;
BEGIN
  -- Get caller info
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Check if caller is admin
  SELECT role INTO v_caller_role
  FROM profiles
  WHERE id = v_caller_id;

  IF v_caller_role <> 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- Validate new role
  IF p_new_role NOT IN ('user', 'admin', 'moderator', 'organizer_verified', 'organizer_pending', 'contributor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  -- Prevent admin from demoting themselves (safety)
  IF v_caller_id = p_user_id AND p_new_role <> 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_demote_self');
  END IF;

  -- Get target's current role
  SELECT role INTO v_target_role
  FROM profiles
  WHERE id = p_user_id;

  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- Perform update
  UPDATE profiles
  SET role = p_new_role
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'old_role', v_target_role,
    'new_role', p_new_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_user_role(uuid, text) TO authenticated;
