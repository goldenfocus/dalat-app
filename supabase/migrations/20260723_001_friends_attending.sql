-- ============================================
-- Friends Attending: Social Proof for Events
-- ============================================

-- 1. Batch query: which friends are attending which events?
-- Returns first 3 friend profiles + total count per event.
CREATE OR REPLACE FUNCTION get_friends_attending_batch(p_user_id uuid, p_event_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(event_data), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'event_id', sub.event_id,
      'friend_profiles', sub.profiles,
      'total_count', sub.total_count
    ) AS event_data
    FROM (
      SELECT
        r.event_id,
        (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'display_name', p.display_name,
              'avatar_url', p.avatar_url
            )
          ), '[]'::jsonb)
          FROM (
            SELECT p2.id, p2.display_name, p2.avatar_url
            FROM rsvps r2
            JOIN user_follows uf ON uf.following_id = r2.user_id AND uf.follower_id = p_user_id
            JOIN profiles p2 ON p2.id = r2.user_id
            WHERE r2.event_id = r.event_id AND r2.status = 'going'
            ORDER BY r2.created_at DESC
            LIMIT 3
          ) p
        ) AS profiles,
        (
          SELECT count(*)::int
          FROM rsvps r3
          JOIN user_follows uf2 ON uf2.following_id = r3.user_id AND uf2.follower_id = p_user_id
          WHERE r3.event_id = r.event_id AND r3.status = 'going'
        ) AS total_count
      FROM unnest(p_event_ids) AS r(event_id)
    ) sub
    WHERE sub.total_count > 0
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 2. Full list: all friends attending a specific event
CREATE OR REPLACE FUNCTION get_friends_attending(p_user_id uuid, p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_friends jsonb;
  v_total int;
BEGIN
  SELECT count(*)::int INTO v_total
  FROM rsvps r
  JOIN user_follows uf ON uf.following_id = r.user_id AND uf.follower_id = p_user_id
  WHERE r.event_id = p_event_id AND r.status = 'going';

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url
    ) ORDER BY r.created_at DESC
  ), '[]'::jsonb) INTO v_friends
  FROM rsvps r
  JOIN user_follows uf ON uf.following_id = r.user_id AND uf.follower_id = p_user_id
  JOIN profiles p ON p.id = r.user_id
  WHERE r.event_id = p_event_id AND r.status = 'going';

  RETURN jsonb_build_object(
    'friends', v_friends,
    'total', v_total
  );
END;
$$;
