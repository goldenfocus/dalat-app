-- ============================================
-- Activity Feed: See what friends are doing
-- ============================================

-- UNION query across RSVPs, moments, and follows for the last 7 days.
-- Only shows activity from users the current user follows.
CREATE OR REPLACE FUNCTION get_friend_activity(p_user_id uuid, p_limit int DEFAULT 20, p_offset int DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_cutoff timestamptz;
BEGIN
  v_cutoff := now() - interval '7 days';

  SELECT COALESCE(jsonb_agg(activity ORDER BY activity->>'created_at' DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    -- RSVPs: friends going to events
    (
      SELECT jsonb_build_object(
        'activity_type', 'rsvp',
        'actor_id', p.id,
        'actor_name', p.display_name,
        'actor_username', p.username,
        'actor_avatar', p.avatar_url,
        'event_id', e.id,
        'event_title', e.title,
        'event_slug', e.slug,
        'event_image', e.image_url,
        'created_at', r.created_at
      ) AS activity
      FROM rsvps r
      JOIN user_follows uf ON uf.following_id = r.user_id AND uf.follower_id = p_user_id
      JOIN profiles p ON p.id = r.user_id
      JOIN events e ON e.id = r.event_id AND e.status = 'published'
      WHERE r.status = 'going'
        AND r.created_at > v_cutoff
        AND e.starts_at > now()  -- only upcoming events
    )

    UNION ALL

    -- Moments: friends posting moments
    (
      SELECT jsonb_build_object(
        'activity_type', 'moment',
        'actor_id', p.id,
        'actor_name', p.display_name,
        'actor_username', p.username,
        'actor_avatar', p.avatar_url,
        'event_id', e.id,
        'event_title', e.title,
        'event_slug', e.slug,
        'moment_id', m.id,
        'moment_media_url', m.media_url,
        'created_at', m.created_at
      ) AS activity
      FROM moments m
      JOIN user_follows uf ON uf.following_id = m.user_id AND uf.follower_id = p_user_id
      JOIN profiles p ON p.id = m.user_id
      JOIN events e ON e.id = m.event_id
      WHERE m.status = 'published'
        AND m.created_at > v_cutoff
    )

    UNION ALL

    -- Follows: friends following new people
    (
      SELECT jsonb_build_object(
        'activity_type', 'follow',
        'actor_id', p.id,
        'actor_name', p.display_name,
        'actor_username', p.username,
        'actor_avatar', p.avatar_url,
        'target_id', tp.id,
        'target_name', tp.display_name,
        'target_username', tp.username,
        'target_avatar', tp.avatar_url,
        'created_at', uf2.created_at
      ) AS activity
      FROM user_follows uf2
      JOIN user_follows uf ON uf.following_id = uf2.follower_id AND uf.follower_id = p_user_id
      JOIN profiles p ON p.id = uf2.follower_id
      JOIN profiles tp ON tp.id = uf2.following_id
      WHERE uf2.created_at > v_cutoff
        AND uf2.following_id != p_user_id  -- don't show "friend followed you"
    )
  ) combined
  ORDER BY activity->>'created_at' DESC
  LIMIT p_limit OFFSET p_offset;

  RETURN v_result;
END;
$$;
