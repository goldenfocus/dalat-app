-- Fix: Invitation page fails for anonymous users due to events RLS
-- Creates a SECURITY DEFINER function to fetch invitation data bypassing RLS

-- Function to get invitation by token (bypasses RLS)
-- This is necessary because the events table has RLS that blocks anonymous users
-- from viewing private tribe events, but invitation holders should always see the event
CREATE OR REPLACE FUNCTION get_invitation_by_token(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', ei.id,
    'email', ei.email,
    'name', ei.name,
    'status', ei.status,
    'rsvp_status', ei.rsvp_status,
    'claimed_by', ei.claimed_by,
    'responded_at', ei.responded_at,
    'event', jsonb_build_object(
      'id', e.id,
      'slug', e.slug,
      'title', e.title,
      'description', e.description,
      'image_url', e.image_url,
      'location_name', e.location_name,
      'address', e.address,
      'google_maps_url', e.google_maps_url,
      'starts_at', e.starts_at,
      'ends_at', e.ends_at,
      'timezone', e.timezone,
      'status', e.status
    ),
    'inviter', jsonb_build_object(
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url
    )
  ) INTO v_result
  FROM event_invitations ei
  JOIN events e ON e.id = ei.event_id
  LEFT JOIN profiles p ON p.id = ei.invited_by
  WHERE ei.token = p_token;

  RETURN v_result;
END;
$$;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_invitation_by_token(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_invitation_by_token(UUID) TO authenticated;
