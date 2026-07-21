-- ============================================================
-- TRIBE INVITATIONS — Phase 2b
-- Spec: docs/superpowers/specs/2026-07-20-tribe-invites-design.md
--
-- Mirrors event_invitations (20260124_001), which is the proven model.
-- Adds:
--   1. notification_type enum value 'tribe_invitation'
--   2. profiles.discoverable  (opt-out of leader user-search)
--   3. tribe_invitations table + RLS + token RPC
--   4. tribe_invite_quotas + check/increment RPCs (SEPARATE bucket from
--      check_invite_quota — a leader inviting their tribe must not burn
--      their event-invite allowance)
-- ============================================================


-- ============================================
-- 1. Notification type
-- ============================================
-- NOTE: PG allows ALTER TYPE ... ADD VALUE inside a transaction block (PG12+),
-- but the new label CANNOT be used in that same transaction. Nothing below
-- references 'tribe_invitation', so this is safe here. Do NOT add an INSERT
-- into notifications using this value to this file.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'tribe_invitation';


-- ============================================
-- 2. profiles.discoverable
-- ============================================
-- Backs the widened /api/users/search: leaders may search users, but only
-- profiles that have not opted out. Defaults true so existing users stay
-- searchable — defaulting false would silently break invite-by-username
-- for every account that already exists.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS discoverable BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_profiles_discoverable
  ON profiles(discoverable) WHERE discoverable = true;


-- ============================================
-- 3. tribe_invitations
-- ============================================
CREATE TABLE IF NOT EXISTS tribe_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id UUID REFERENCES tribes(id) ON DELETE CASCADE NOT NULL,
  invited_by UUID REFERENCES profiles(id) NOT NULL,
  -- Username invites reuse the event path's synthetic-email trick
  -- (user-<uuid>@dalat.app) so one table and one unique constraint serve
  -- both the email and the username path.
  email TEXT NOT NULL,
  name TEXT,
  token UUID UNIQUE DEFAULT gen_random_uuid(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'viewed', 'accepted')),
  claimed_by UUID REFERENCES profiles(id),
  personal_note TEXT,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tribe_id, email)
);

CREATE INDEX IF NOT EXISTS idx_tribe_invitations_tribe ON tribe_invitations(tribe_id);
CREATE INDEX IF NOT EXISTS idx_tribe_invitations_token ON tribe_invitations(token);
CREATE INDEX IF NOT EXISTS idx_tribe_invitations_email ON tribe_invitations(email);
CREATE INDEX IF NOT EXISTS idx_tribe_invitations_claimed ON tribe_invitations(claimed_by);
CREATE INDEX IF NOT EXISTS idx_tribe_invitations_invited_by ON tribe_invitations(invited_by);

ALTER TABLE tribe_invitations ENABLE ROW LEVEL SECURITY;

-- Deliberately NOT "USING (true)" like event_invitations. An invite row names
-- a tribe and an email; anonymous read of the whole table is not needed
-- because the landing page goes through get_tribe_invitation_by_token().
DROP POLICY IF EXISTS "tribe_invitations_select" ON tribe_invitations;
CREATE POLICY "tribe_invitations_select" ON tribe_invitations FOR SELECT USING (
  invited_by = auth.uid()
  OR claimed_by = auth.uid()
  OR is_tribe_admin(tribe_id)
);

-- Only leaders/admins of THIS tribe may create invitations, and only in their
-- own name. RLS authorizes the actor; the route additionally re-checks so the
-- 403 is explicit rather than an empty-result mystery.
DROP POLICY IF EXISTS "tribe_invitations_insert" ON tribe_invitations;
CREATE POLICY "tribe_invitations_insert" ON tribe_invitations FOR INSERT WITH CHECK (
  invited_by = auth.uid()
  AND is_tribe_admin(tribe_id)
);

-- The post-update row must still pass SELECT or the UPDATE fails 42501
-- (the invisible-new-row trap fixed in 20261007). Every branch below keeps
-- the actor visible: an admin stays an admin, an invitee sets claimed_by
-- to their own id.
DROP POLICY IF EXISTS "tribe_invitations_update" ON tribe_invitations;
CREATE POLICY "tribe_invitations_update" ON tribe_invitations FOR UPDATE USING (
  invited_by = auth.uid()
  OR claimed_by = auth.uid()
  OR is_tribe_admin(tribe_id)
);

DROP POLICY IF EXISTS "tribe_invitations_delete" ON tribe_invitations;
CREATE POLICY "tribe_invitations_delete" ON tribe_invitations FOR DELETE USING (
  invited_by = auth.uid()
  OR is_tribe_admin(tribe_id)
);


-- Anonymous invitees must be able to read their own invitation. `tribes` RLS
-- hides secret tribes from non-members, so a plain join would return nothing —
-- same reason 20260417_001 exists for event invitations.
CREATE OR REPLACE FUNCTION get_tribe_invitation_by_token(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', ti.id,
    'email', ti.email,
    'name', ti.name,
    'status', ti.status,
    'claimed_by', ti.claimed_by,
    'personal_note', ti.personal_note,
    'accepted_at', ti.accepted_at,
    'tribe', jsonb_build_object(
      'id', t.id,
      'slug', t.slug,
      'name', t.name,
      'description', t.description,
      'cover_image_url', t.cover_image_url,
      'access_type', t.access_type,
      'settings', t.settings,
      'member_count', t.member_count
    ),
    'inviter', jsonb_build_object(
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url
    )
  ) INTO v_result
  FROM tribe_invitations ti
  JOIN tribes t ON t.id = ti.tribe_id
  LEFT JOIN profiles p ON p.id = ti.invited_by
  WHERE ti.token = p_token;

  -- Read receipt lives here, not in the page. An anonymous invitee cannot
  -- satisfy `tribe_invitations_update` (invited_by / claimed_by / tribe admin),
  -- so an UPDATE from the landing page would silently no-op forever.
  UPDATE tribe_invitations
  SET status = 'viewed', viewed_at = now()
  WHERE token = p_token AND status = 'sent';

  -- Deliberately does NOT return tribes.invite_code. That code grants instant
  -- membership via /api/tribes/[slug]/membership; an invitation token is
  -- single-tribe and revocable, an invite_code is neither.
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_tribe_invitation_by_token(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_tribe_invitation_by_token(UUID) TO authenticated;


-- ============================================
-- 4. Tribe invite quota — its own bucket
-- ============================================
CREATE TABLE IF NOT EXISTS tribe_invite_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  daily_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_tribe_invite_quotas_user ON tribe_invite_quotas(user_id);

ALTER TABLE tribe_invite_quotas ENABLE ROW LEVEL SECURITY;

-- Reads only; both writes go through SECURITY DEFINER functions.
DROP POLICY IF EXISTS "tribe_invite_quotas_select_own" ON tribe_invite_quotas;
CREATE POLICY "tribe_invite_quotas_select_own" ON tribe_invite_quotas FOR SELECT USING (
  user_id = auth.uid()
);


-- Returns the same JSONB shape as check_invite_quota so the route can map it
-- to HTTP 429 identically: {allowed, reason?, remaining_daily, remaining_weekly}
CREATE OR REPLACE FUNCTION check_tribe_invite_quota(p_user_id UUID, p_count INT DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_daily_limit INT := 30;
  v_weekly_limit INT := 100;
  v_daily_used INT;
  v_weekly_used INT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;

  IF v_role IN ('admin', 'superadmin') THEN
    RETURN jsonb_build_object('allowed', true, 'remaining_daily', 999999, 'remaining_weekly', 999999);
  END IF;

  SELECT COALESCE(daily_count, 0) INTO v_daily_used
  FROM tribe_invite_quotas
  WHERE user_id = p_user_id AND date = CURRENT_DATE;
  v_daily_used := COALESCE(v_daily_used, 0);

  SELECT COALESCE(SUM(daily_count), 0) INTO v_weekly_used
  FROM tribe_invite_quotas
  WHERE user_id = p_user_id
    AND date >= date_trunc('week', CURRENT_DATE)::date;
  v_weekly_used := COALESCE(v_weekly_used, 0);

  IF v_daily_used + p_count > v_daily_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit_exceeded',
      'remaining_daily', GREATEST(0, v_daily_limit - v_daily_used),
      'remaining_weekly', GREATEST(0, v_weekly_limit - v_weekly_used)
    );
  END IF;

  IF v_weekly_used + p_count > v_weekly_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'weekly_limit_exceeded',
      'remaining_daily', GREATEST(0, v_daily_limit - v_daily_used),
      'remaining_weekly', GREATEST(0, v_weekly_limit - v_weekly_used)
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining_daily', v_daily_limit - v_daily_used - p_count,
    'remaining_weekly', v_weekly_limit - v_weekly_used - p_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION increment_tribe_invite_quota(p_user_id UUID, p_count INT DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO tribe_invite_quotas (user_id, date, daily_count)
  VALUES (p_user_id, CURRENT_DATE, p_count)
  ON CONFLICT (user_id, date) DO UPDATE
  SET daily_count = tribe_invite_quotas.daily_count + p_count;
END;
$$;

GRANT EXECUTE ON FUNCTION check_tribe_invite_quota(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_tribe_invite_quota(UUID, INT) TO authenticated;
