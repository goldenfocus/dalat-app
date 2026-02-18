-- ============================================
-- Loyalty Program v2 Migration
-- Enhanced loyalty/rewards system with host rewards
-- ============================================
-- This migration creates the v2 loyalty system alongside the existing v1 tables.
-- Uses CHECK constraints (not enums) for flexibility.
-- 4-tier system: explorer (0), local (100), insider (500), legend (2000)

-- ============================================
-- CORE LOYALTY TABLES
-- ============================================

-- User loyalty status (current state)
CREATE TABLE IF NOT EXISTS user_loyalty_status (
  user_id uuid PRIMARY KEY REFERENCES profiles ON DELETE CASCADE,

  -- Current tier
  current_tier text NOT NULL DEFAULT 'explorer' CHECK (
    current_tier IN ('explorer', 'local', 'insider', 'legend')
  ),

  -- Point balance
  total_points_earned int NOT NULL DEFAULT 0 CHECK (total_points_earned >= 0),
  total_points_spent int NOT NULL DEFAULT 0 CHECK (total_points_spent >= 0),
  current_point_balance int GENERATED ALWAYS AS (total_points_earned - total_points_spent) STORED,

  -- Activity tracking
  last_points_earned_at timestamptz,
  last_tier_change_at timestamptz,

  -- Metadata
  enrolled_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_status_tier ON user_loyalty_status(current_tier);
CREATE INDEX IF NOT EXISTS idx_loyalty_status_points ON user_loyalty_status(current_point_balance DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_status_last_active ON user_loyalty_status(last_points_earned_at DESC);

-- Point transaction ledger
CREATE TABLE IF NOT EXISTS loyalty_point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,

  -- Point change
  points_delta int NOT NULL,  -- positive = earned, negative = spent

  -- Activity context
  activity_type text NOT NULL CHECK (
    activity_type IN (
      -- Attendee activities
      'event_rsvp',
      'event_attendance',
      'event_checkin',
      'moment_upload',
      'moment_like',
      'comment_post',
      'profile_complete',
      'referral',
      'invite_accepted',
      'first_event',
      'streak_bonus',
      'reward_redemption',  -- negative delta
      'admin_adjustment',   -- can be positive or negative
      'tier_bonus',
      'birthday_bonus',
      -- Host activities
      'event_hosted',           -- +30 pts - hosting a successful event
      'event_series_created',   -- +50 pts - creating a recurring series
      'venue_created',          -- +30 pts - adding a new venue
      'blog_published',         -- +40 pts - publishing a blog post
      'livestream_hosted'       -- +25 pts - hosting a livestream
    )
  ),

  -- Reference to the triggering entity
  reference_id uuid,  -- event_id, moment_id, comment_id, etc.
  reference_type text CHECK (
    reference_type IS NULL OR
    reference_type IN ('event', 'moment', 'comment', 'user', 'reward', 'venue', 'blog', 'livestream', 'event_series')
  ),

  -- Admin notes (for manual adjustments)
  admin_note text,
  admin_user_id uuid REFERENCES profiles ON DELETE SET NULL,

  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user_created ON loyalty_point_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_activity ON loyalty_point_transactions(activity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_reference ON loyalty_point_transactions(reference_type, reference_id);

-- Tier progression history
CREATE TABLE IF NOT EXISTS loyalty_tier_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,

  -- Tier change
  old_tier text CHECK (old_tier IN ('explorer', 'local', 'insider', 'legend')),
  new_tier text NOT NULL CHECK (new_tier IN ('explorer', 'local', 'insider', 'legend')),

  -- Context
  points_at_change int NOT NULL,
  trigger_type text NOT NULL CHECK (
    trigger_type IN ('points_threshold', 'admin_override', 'tier_decay', 'points_adjustment')
  ),

  -- Timestamps
  achieved_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tier_history_user ON loyalty_tier_history(user_id, achieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_tier_history_tier ON loyalty_tier_history(new_tier, achieved_at DESC);

-- ============================================
-- REWARDS CATALOG
-- ============================================

CREATE TABLE IF NOT EXISTS rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reward details
  name text NOT NULL,
  description text,
  category text NOT NULL CHECK (
    category IN ('experiential', 'transactional', 'digital', 'social', 'exclusive', 'host')
  ),

  -- Redemption requirements
  points_cost int NOT NULL CHECK (points_cost > 0),
  min_tier text CHECK (min_tier IN ('explorer', 'local', 'insider', 'legend')),

  -- Availability
  is_active boolean DEFAULT true,
  stock_quantity int,  -- NULL = unlimited
  max_per_user int,    -- NULL = unlimited

  -- Validity
  valid_from timestamptz,
  valid_until timestamptz,

  -- Partner/sponsor info
  partner_name text,
  partner_logo_url text,
  redemption_instructions text,

  -- Economics
  monetary_value_usd numeric(10,2),
  cost_to_provide_usd numeric(10,2),

  -- Admin
  created_by uuid REFERENCES profiles ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rewards_active ON rewards(is_active, points_cost) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_rewards_category ON rewards(category);

-- Reward redemptions
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  reward_id uuid REFERENCES rewards ON DELETE RESTRICT NOT NULL,

  -- Redemption details
  points_spent int NOT NULL,
  user_tier_at_redemption text NOT NULL CHECK (
    user_tier_at_redemption IN ('explorer', 'local', 'insider', 'legend')
  ),

  -- Fulfillment status
  status text DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'fulfilled', 'cancelled', 'expired')
  ),
  fulfillment_notes text,
  fulfilled_at timestamptz,
  fulfilled_by uuid REFERENCES profiles ON DELETE SET NULL,

  -- Unique redemption code (for digital rewards)
  redemption_code text UNIQUE,

  -- Timestamps
  redeemed_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redemptions_user ON reward_redemptions(user_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemptions_reward ON reward_redemptions(reward_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemptions_status ON reward_redemptions(status, redeemed_at DESC);

-- ============================================
-- HOST REWARDS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS host_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  reward_type text NOT NULL CHECK (
    reward_type IN (
      'premium_listing',
      'analytics_access',
      'featured_placement',
      'priority_support',
      'custom_branding'
    )
  ),
  -- Which tier unlocked this
  granted_at_tier text NOT NULL CHECK (
    granted_at_tier IN ('explorer', 'local', 'insider', 'legend')
  ),
  -- Is currently active
  is_active boolean DEFAULT true,
  -- Metadata (e.g., which event gets premium listing)
  metadata jsonb DEFAULT '{}',
  -- Timestamps
  granted_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_host_rewards_user ON host_rewards(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_host_rewards_type ON host_rewards(reward_type, is_active);
CREATE INDEX IF NOT EXISTS idx_host_rewards_tier ON host_rewards(granted_at_tier);

-- Prevent duplicate active host rewards of the same type for the same user
CREATE UNIQUE INDEX IF NOT EXISTS idx_host_rewards_unique_active
  ON host_rewards(user_id, reward_type)
  WHERE is_active = true;

-- ============================================
-- A/B TESTING FRAMEWORK
-- ============================================

CREATE TABLE IF NOT EXISTS loyalty_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Experiment details
  name text NOT NULL,
  description text,
  hypothesis text,

  -- Variant configuration
  variant_config jsonb NOT NULL,

  -- Targeting
  affected_activity_type text,
  target_user_segment text,

  -- Timeline
  start_date date NOT NULL,
  end_date date,

  -- Status
  status text DEFAULT 'draft' CHECK (
    status IN ('draft', 'active', 'paused', 'completed', 'cancelled')
  ),

  -- Results tracking
  results_summary jsonb,

  -- Admin
  created_by uuid REFERENCES profiles ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experiments_status ON loyalty_experiments(status, start_date);

CREATE TABLE IF NOT EXISTS loyalty_experiment_assignments (
  user_id uuid REFERENCES profiles ON DELETE CASCADE,
  experiment_id uuid REFERENCES loyalty_experiments ON DELETE CASCADE,

  -- Variant assignment
  variant text NOT NULL CHECK (variant IN ('control', 'treatment')),

  -- Assignment metadata
  assigned_at timestamptz DEFAULT now(),

  PRIMARY KEY (user_id, experiment_id)
);

CREATE INDEX IF NOT EXISTS idx_experiment_assignments_variant ON loyalty_experiment_assignments(experiment_id, variant);

-- ============================================
-- TRIGGERS: updated_at
-- ============================================

CREATE TRIGGER user_loyalty_status_updated_at
  BEFORE UPDATE ON user_loyalty_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER rewards_updated_at
  BEFORE UPDATE ON rewards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER reward_redemptions_updated_at
  BEFORE UPDATE ON reward_redemptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER loyalty_experiments_updated_at
  BEFORE UPDATE ON loyalty_experiments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER host_rewards_updated_at
  BEFORE UPDATE ON host_rewards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- TRIGGER: Auto-enroll users on first point transaction
-- ============================================

CREATE OR REPLACE FUNCTION auto_enroll_loyalty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_loyalty_status (
    user_id,
    total_points_earned,
    total_points_spent,
    last_points_earned_at
  )
  VALUES (
    NEW.user_id,
    CASE WHEN NEW.points_delta > 0 THEN NEW.points_delta ELSE 0 END,
    CASE WHEN NEW.points_delta < 0 THEN ABS(NEW.points_delta) ELSE 0 END,
    CASE WHEN NEW.points_delta > 0 THEN NEW.created_at ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_points_earned = user_loyalty_status.total_points_earned +
      CASE WHEN NEW.points_delta > 0 THEN NEW.points_delta ELSE 0 END,
    total_points_spent = user_loyalty_status.total_points_spent +
      CASE WHEN NEW.points_delta < 0 THEN ABS(NEW.points_delta) ELSE 0 END,
    last_points_earned_at = CASE
      WHEN NEW.points_delta > 0 THEN NEW.created_at
      ELSE user_loyalty_status.last_points_earned_at
    END,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_loyalty_transaction_created
  AFTER INSERT ON loyalty_point_transactions
  FOR EACH ROW EXECUTE FUNCTION auto_enroll_loyalty();

-- ============================================
-- TRIGGER: Auto-update tier when points threshold crossed
-- ============================================

CREATE OR REPLACE FUNCTION check_tier_progression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_tier text;
  v_new_tier text;
  v_current_points int;
BEGIN
  v_old_tier := NEW.current_tier;
  v_current_points := NEW.current_point_balance;

  -- Determine new tier based on points
  -- Thresholds: explorer=0, local=100, insider=500, legend=2000
  v_new_tier := CASE
    WHEN v_current_points >= 2000 THEN 'legend'
    WHEN v_current_points >= 500 THEN 'insider'
    WHEN v_current_points >= 100 THEN 'local'
    ELSE 'explorer'
  END;

  -- If tier changed, record history and update
  IF v_new_tier != v_old_tier THEN
    INSERT INTO loyalty_tier_history (user_id, old_tier, new_tier, points_at_change, trigger_type)
    VALUES (NEW.user_id, v_old_tier, v_new_tier, v_current_points, 'points_threshold');

    NEW.current_tier := v_new_tier;
    NEW.last_tier_change_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_loyalty_status_tier_check
  BEFORE UPDATE OF total_points_earned, total_points_spent ON user_loyalty_status
  FOR EACH ROW EXECUTE FUNCTION check_tier_progression();

-- ============================================
-- TRIGGER: Decrement reward stock on redemption
-- ============================================

CREATE OR REPLACE FUNCTION decrement_reward_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only decrement if reward has stock tracking
  UPDATE rewards
  SET stock_quantity = stock_quantity - 1
  WHERE id = NEW.reward_id
    AND stock_quantity IS NOT NULL
    AND stock_quantity > 0;

  -- Check if stock went to 0, mark reward inactive
  UPDATE rewards
  SET is_active = false
  WHERE id = NEW.reward_id
    AND stock_quantity = 0;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_reward_redeemed
  AFTER INSERT ON reward_redemptions
  FOR EACH ROW EXECUTE FUNCTION decrement_reward_stock();

-- ============================================
-- TRIGGER: Auto-grant host rewards on tier change
-- ============================================

CREATE OR REPLACE FUNCTION auto_grant_host_rewards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when tier actually changes (tier_history insert = tier changed)
  -- Grant rewards based on new tier (cumulative: higher tiers get lower-tier rewards too)

  -- local tier -> analytics_access (basic event stats)
  IF NEW.new_tier IN ('local', 'insider', 'legend') THEN
    INSERT INTO host_rewards (user_id, reward_type, granted_at_tier, metadata)
    VALUES (
      NEW.user_id,
      'analytics_access',
      'local',
      '{"description": "Basic event statistics and attendance analytics"}'::jsonb
    )
    ON CONFLICT (user_id, reward_type) WHERE is_active = true DO NOTHING;
  END IF;

  -- insider tier -> premium_listing (events show higher in search)
  IF NEW.new_tier IN ('insider', 'legend') THEN
    INSERT INTO host_rewards (user_id, reward_type, granted_at_tier, metadata)
    VALUES (
      NEW.user_id,
      'premium_listing',
      'insider',
      '{"description": "Events appear higher in search results and category listings"}'::jsonb
    )
    ON CONFLICT (user_id, reward_type) WHERE is_active = true DO NOTHING;
  END IF;

  -- insider tier -> featured_placement (featured on homepage occasionally)
  IF NEW.new_tier IN ('insider', 'legend') THEN
    INSERT INTO host_rewards (user_id, reward_type, granted_at_tier, metadata)
    VALUES (
      NEW.user_id,
      'featured_placement',
      'insider',
      '{"description": "Events occasionally featured on the homepage"}'::jsonb
    )
    ON CONFLICT (user_id, reward_type) WHERE is_active = true DO NOTHING;
  END IF;

  -- legend tier -> custom_branding (custom event page branding)
  IF NEW.new_tier = 'legend' THEN
    INSERT INTO host_rewards (user_id, reward_type, granted_at_tier, metadata)
    VALUES (
      NEW.user_id,
      'custom_branding',
      'legend',
      '{"description": "Custom colors, banners, and branding for your event pages"}'::jsonb
    )
    ON CONFLICT (user_id, reward_type) WHERE is_active = true DO NOTHING;
  END IF;

  -- legend tier -> priority_support (priority response from team)
  IF NEW.new_tier = 'legend' THEN
    INSERT INTO host_rewards (user_id, reward_type, granted_at_tier, metadata)
    VALUES (
      NEW.user_id,
      'priority_support',
      'legend',
      '{"description": "Priority response and dedicated support from the DaLat team"}'::jsonb
    )
    ON CONFLICT (user_id, reward_type) WHERE is_active = true DO NOTHING;
  END IF;

  -- If user was downgraded, deactivate rewards from higher tiers
  IF NEW.new_tier = 'explorer' THEN
    UPDATE host_rewards
    SET is_active = false, updated_at = NOW()
    WHERE user_id = NEW.user_id
      AND is_active = true
      AND granted_at_tier IN ('local', 'insider', 'legend');
  ELSIF NEW.new_tier = 'local' THEN
    UPDATE host_rewards
    SET is_active = false, updated_at = NOW()
    WHERE user_id = NEW.user_id
      AND is_active = true
      AND granted_at_tier IN ('insider', 'legend');
  ELSIF NEW.new_tier = 'insider' THEN
    UPDATE host_rewards
    SET is_active = false, updated_at = NOW()
    WHERE user_id = NEW.user_id
      AND is_active = true
      AND granted_at_tier = 'legend';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_tier_change_grant_host_rewards
  AFTER INSERT ON loyalty_tier_history
  FOR EACH ROW EXECUTE FUNCTION auto_grant_host_rewards();

-- ============================================
-- RLS POLICIES
-- ============================================

-- USER_LOYALTY_STATUS
ALTER TABLE user_loyalty_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_status_select_own"
ON user_loyalty_status FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "loyalty_status_select_admin"
ON user_loyalty_status FOR SELECT
USING (has_role_level('admin'));

-- LOYALTY_POINT_TRANSACTIONS
ALTER TABLE loyalty_point_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_transactions_select_own"
ON loyalty_point_transactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "loyalty_transactions_select_admin"
ON loyalty_point_transactions FOR SELECT
USING (has_role_level('admin'));

-- LOYALTY_TIER_HISTORY
ALTER TABLE loyalty_tier_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tier_history_select_own"
ON loyalty_tier_history FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "tier_history_select_admin"
ON loyalty_tier_history FOR SELECT
USING (has_role_level('admin'));

-- REWARDS
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rewards_select_active"
ON rewards FOR SELECT
USING (is_active = true OR has_role_level('admin'));

CREATE POLICY "rewards_insert_admin"
ON rewards FOR INSERT
WITH CHECK (has_role_level('admin'));

CREATE POLICY "rewards_update_admin"
ON rewards FOR UPDATE
USING (has_role_level('admin'))
WITH CHECK (has_role_level('admin'));

CREATE POLICY "rewards_delete_admin"
ON rewards FOR DELETE
USING (has_role_level('admin'));

-- REWARD_REDEMPTIONS
ALTER TABLE reward_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "redemptions_select_own"
ON reward_redemptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "redemptions_select_admin"
ON reward_redemptions FOR SELECT
USING (has_role_level('admin'));

CREATE POLICY "redemptions_update_admin"
ON reward_redemptions FOR UPDATE
USING (has_role_level('admin'))
WITH CHECK (has_role_level('admin'));

-- HOST_REWARDS
ALTER TABLE host_rewards ENABLE ROW LEVEL SECURITY;

-- Users can view their own host rewards
CREATE POLICY "host_rewards_select_own"
ON host_rewards FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view all host rewards
CREATE POLICY "host_rewards_select_admin"
ON host_rewards FOR SELECT
USING (has_role_level('admin'));

-- System functions handle INSERT/UPDATE (SECURITY DEFINER functions bypass RLS)
-- No direct INSERT/UPDATE policies for regular users

-- Admins can update host rewards (e.g., deactivate, modify metadata)
CREATE POLICY "host_rewards_update_admin"
ON host_rewards FOR UPDATE
USING (has_role_level('admin'))
WITH CHECK (has_role_level('admin'));

-- LOYALTY_EXPERIMENTS
ALTER TABLE loyalty_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "experiments_admin_all"
ON loyalty_experiments FOR ALL
USING (has_role_level('admin'))
WITH CHECK (has_role_level('admin'));

-- LOYALTY_EXPERIMENT_ASSIGNMENTS
ALTER TABLE loyalty_experiment_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "experiment_assignments_admin_all"
ON loyalty_experiment_assignments FOR ALL
USING (has_role_level('admin'))
WITH CHECK (has_role_level('admin'));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get tier rank (for sorting/comparison)
CREATE OR REPLACE FUNCTION tier_rank(tier_name text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE tier_name
    WHEN 'explorer' THEN 1
    WHEN 'local' THEN 2
    WHEN 'insider' THEN 3
    WHEN 'legend' THEN 4
    ELSE 0
  END;
$$;

-- ============================================
-- MAIN FUNCTION: Award loyalty points
-- ============================================

CREATE OR REPLACE FUNCTION award_loyalty_points(
  p_user_id uuid,
  p_activity_type text,
  p_points int DEFAULT NULL,  -- if NULL, use default for activity_type
  p_reference_id uuid DEFAULT NULL,
  p_reference_type text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points int;
  v_existing_transaction_id uuid;
BEGIN
  -- Prevent duplicate transactions for same reference
  IF p_reference_id IS NOT NULL THEN
    SELECT id INTO v_existing_transaction_id
    FROM loyalty_point_transactions
    WHERE user_id = p_user_id
      AND activity_type = p_activity_type
      AND reference_id = p_reference_id
    LIMIT 1;

    IF v_existing_transaction_id IS NOT NULL THEN
      RAISE NOTICE 'Points already awarded for this activity';
      RETURN 0;  -- Already awarded
    END IF;
  END IF;

  -- Determine points (custom or default)
  v_points := COALESCE(p_points, CASE p_activity_type
    -- Attendee activities
    WHEN 'event_rsvp' THEN 10
    WHEN 'event_attendance' THEN 50
    WHEN 'event_checkin' THEN 25
    WHEN 'moment_upload' THEN 25
    WHEN 'moment_like' THEN 2
    WHEN 'comment_post' THEN 5
    WHEN 'profile_complete' THEN 20
    WHEN 'referral' THEN 100
    WHEN 'invite_accepted' THEN 50
    WHEN 'first_event' THEN 30
    WHEN 'streak_bonus' THEN 15
    WHEN 'tier_bonus' THEN 50
    WHEN 'birthday_bonus' THEN 25
    -- Host activities
    WHEN 'event_hosted' THEN 30
    WHEN 'event_series_created' THEN 50
    WHEN 'venue_created' THEN 30
    WHEN 'blog_published' THEN 40
    WHEN 'livestream_hosted' THEN 25
    ELSE 0
  END);

  IF v_points <= 0 THEN
    RETURN 0;  -- No points to award
  END IF;

  -- Insert transaction (triggers will handle enrollment and tier progression)
  INSERT INTO loyalty_point_transactions (
    user_id,
    points_delta,
    activity_type,
    reference_id,
    reference_type
  )
  VALUES (
    p_user_id,
    v_points,
    p_activity_type,
    p_reference_id,
    p_reference_type
  );

  RETURN v_points;
END;
$$;

GRANT EXECUTE ON FUNCTION award_loyalty_points(uuid, text, int, uuid, text) TO authenticated;

-- ============================================
-- HOST-SPECIFIC: Award host points convenience function
-- ============================================

CREATE OR REPLACE FUNCTION award_host_points(
  p_user_id uuid,
  p_activity_type text,
  p_reference_id uuid DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_points int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points_awarded int;
  v_valid_host_activities text[] := ARRAY[
    'event_hosted',
    'event_series_created',
    'venue_created',
    'blog_published',
    'livestream_hosted'
  ];
  v_user_tier text;
  v_user_points int;
BEGIN
  -- Validate this is a host activity type
  IF NOT (p_activity_type = ANY(v_valid_host_activities)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_host_activity',
      'message', 'Activity type must be one of: event_hosted, event_series_created, venue_created, blog_published, livestream_hosted'
    );
  END IF;

  -- Auto-detect reference_type from activity_type if not provided
  IF p_reference_type IS NULL THEN
    p_reference_type := CASE p_activity_type
      WHEN 'event_hosted' THEN 'event'
      WHEN 'event_series_created' THEN 'event_series'
      WHEN 'venue_created' THEN 'venue'
      WHEN 'blog_published' THEN 'blog'
      WHEN 'livestream_hosted' THEN 'livestream'
      ELSE NULL
    END;
  END IF;

  -- Use the main award function (handles dedup, enrollment, tier progression)
  v_points_awarded := award_loyalty_points(
    p_user_id,
    p_activity_type,
    p_points,
    p_reference_id,
    p_reference_type
  );

  -- Fetch updated user status
  SELECT current_tier, current_point_balance
  INTO v_user_tier, v_user_points
  FROM user_loyalty_status
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'points_awarded', v_points_awarded,
    'activity_type', p_activity_type,
    'reference_id', p_reference_id,
    'current_tier', COALESCE(v_user_tier, 'explorer'),
    'current_points', COALESCE(v_user_points, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION award_host_points(uuid, text, uuid, text, int) TO authenticated;

-- ============================================
-- HOST-SPECIFIC: Get host rewards for a user
-- ============================================

CREATE OR REPLACE FUNCTION get_host_rewards(p_user_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  reward_type text,
  granted_at_tier text,
  is_active boolean,
  metadata jsonb,
  granted_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := COALESCE(p_user_id, auth.uid());

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Only allow users to see their own rewards, or admins to see anyone's
  IF v_uid != auth.uid() AND NOT has_role_level('admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    hr.id,
    hr.reward_type,
    hr.granted_at_tier,
    hr.is_active,
    hr.metadata,
    hr.granted_at,
    hr.expires_at
  FROM host_rewards hr
  WHERE hr.user_id = v_uid
    AND hr.is_active = true
    AND (hr.expires_at IS NULL OR hr.expires_at > NOW())
  ORDER BY
    tier_rank(hr.granted_at_tier) DESC,
    hr.granted_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_host_rewards(uuid) TO authenticated;

-- ============================================
-- Redeem reward function
-- ============================================

CREATE OR REPLACE FUNCTION redeem_loyalty_reward(
  p_reward_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_reward_cost int;
  v_current_balance int;
  v_current_tier text;
  v_min_tier text;
  v_reward_stock int;
  v_max_per_user int;
  v_user_redemption_count int;
  v_redemption_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get reward details
  SELECT points_cost, min_tier, stock_quantity, max_per_user
  INTO v_reward_cost, v_min_tier, v_reward_stock, v_max_per_user
  FROM rewards
  WHERE id = p_reward_id
    AND is_active = true
    AND (valid_from IS NULL OR valid_from <= NOW())
    AND (valid_until IS NULL OR valid_until >= NOW());

  IF v_reward_cost IS NULL THEN
    RAISE EXCEPTION 'reward_not_available';
  END IF;

  -- Get user's current status
  SELECT current_point_balance, current_tier
  INTO v_current_balance, v_current_tier
  FROM user_loyalty_status
  WHERE user_id = v_user_id;

  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'user_not_enrolled';
  END IF;

  -- Check point balance
  IF v_current_balance < v_reward_cost THEN
    RAISE EXCEPTION 'insufficient_points';
  END IF;

  -- Check tier requirement
  IF v_min_tier IS NOT NULL AND tier_rank(v_current_tier) < tier_rank(v_min_tier) THEN
    RAISE EXCEPTION 'tier_requirement_not_met';
  END IF;

  -- Check stock
  IF v_reward_stock IS NOT NULL AND v_reward_stock <= 0 THEN
    RAISE EXCEPTION 'reward_out_of_stock';
  END IF;

  -- Check max per user
  IF v_max_per_user IS NOT NULL THEN
    SELECT COUNT(*) INTO v_user_redemption_count
    FROM reward_redemptions
    WHERE user_id = v_user_id
      AND reward_id = p_reward_id
      AND status != 'cancelled';

    IF v_user_redemption_count >= v_max_per_user THEN
      RAISE EXCEPTION 'max_redemptions_reached';
    END IF;
  END IF;

  -- Deduct points
  INSERT INTO loyalty_point_transactions (
    user_id,
    points_delta,
    activity_type,
    reference_id,
    reference_type
  )
  VALUES (
    v_user_id,
    -v_reward_cost,
    'reward_redemption',
    p_reward_id,
    'reward'
  );

  -- Create redemption record
  INSERT INTO reward_redemptions (
    user_id,
    reward_id,
    points_spent,
    user_tier_at_redemption,
    status
  )
  VALUES (
    v_user_id,
    p_reward_id,
    v_reward_cost,
    v_current_tier,
    'pending'
  )
  RETURNING id INTO v_redemption_id;

  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', v_redemption_id,
    'points_spent', v_reward_cost,
    'new_balance', v_current_balance - v_reward_cost
  );
END;
$$;

GRANT EXECUTE ON FUNCTION redeem_loyalty_reward(uuid) TO authenticated;

-- ============================================
-- Get user's loyalty summary
-- ============================================

CREATE OR REPLACE FUNCTION get_my_loyalty_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_summary jsonb;
  v_host_rewards jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get host rewards for this user
  SELECT jsonb_agg(
    jsonb_build_object(
      'reward_type', hr.reward_type,
      'granted_at_tier', hr.granted_at_tier,
      'granted_at', hr.granted_at,
      'metadata', hr.metadata
    )
  )
  INTO v_host_rewards
  FROM host_rewards hr
  WHERE hr.user_id = v_user_id
    AND hr.is_active = true
    AND (hr.expires_at IS NULL OR hr.expires_at > NOW());

  SELECT jsonb_build_object(
    'current_tier', uls.current_tier,
    'current_points', uls.current_point_balance,
    'total_earned', uls.total_points_earned,
    'total_spent', uls.total_points_spent,
    'enrolled_at', uls.enrolled_at,
    'last_activity', uls.last_points_earned_at,
    'next_tier', CASE uls.current_tier
      WHEN 'explorer' THEN 'local'
      WHEN 'local' THEN 'insider'
      WHEN 'insider' THEN 'legend'
      ELSE NULL
    END,
    'points_to_next_tier', CASE uls.current_tier
      WHEN 'explorer' THEN GREATEST(100 - uls.current_point_balance, 0)
      WHEN 'local' THEN GREATEST(500 - uls.current_point_balance, 0)
      WHEN 'insider' THEN GREATEST(2000 - uls.current_point_balance, 0)
      ELSE NULL
    END,
    'host_rewards', COALESCE(v_host_rewards, '[]'::jsonb),
    'recent_transactions', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'points', points_delta,
          'activity', activity_type,
          'created_at', created_at
        ) ORDER BY created_at DESC
      ), '[]'::jsonb)
      FROM (
        SELECT * FROM loyalty_point_transactions
        WHERE user_id = v_user_id
        ORDER BY created_at DESC
        LIMIT 10
      ) t
    )
  ) INTO v_summary
  FROM user_loyalty_status uls
  WHERE uls.user_id = v_user_id;

  RETURN COALESCE(v_summary, jsonb_build_object('enrolled', false));
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_loyalty_summary() TO authenticated;

-- ============================================
-- SEED DATA: General rewards
-- ============================================

INSERT INTO rewards (name, description, category, points_cost, min_tier, monetary_value_usd) VALUES
  ('Free Coffee at The Hideout', 'Redeem for a free coffee at The Hideout cafe', 'transactional', 50, NULL, 4.00),
  ('Event Early Access', 'Get early RSVP access to sold-out events', 'experiential', 100, NULL, 10.00),
  ('Profile Badge: Local Legend', 'Unlock exclusive profile badge', 'digital', 150, NULL, 0.00),
  ('VIP Event Lounge Access', 'Access to VIP lounge at select events', 'exclusive', 300, 'insider', 25.00),
  ('Dalat T-Shirt', 'Official Dalat merch shirt (limited edition)', 'transactional', 500, NULL, 20.00),
  ('Private Event Invitation', 'Invite to exclusive insider-only events', 'exclusive', 750, 'insider', 50.00)
ON CONFLICT DO NOTHING;

-- ============================================
-- SEED DATA: Host rewards in rewards catalog
-- ============================================

INSERT INTO rewards (name, description, category, points_cost, min_tier, monetary_value_usd) VALUES
  ('Event Analytics Pro', 'Advanced event analytics including attendee demographics, engagement trends, and comparative performance data', 'host', 200, 'insider', 0.00),
  ('Featured Event Slot', 'Your next event gets featured on the DaLat homepage for 7 days', 'host', 300, 'insider', 25.00),
  ('Premium Host Badge', 'Verified host profile badge that shows on all your events and profile', 'host', 100, 'local', 0.00),
  ('Priority Event Listing', 'Your event appears at the top of its category for 3 days', 'host', 250, 'insider', 15.00),
  ('Custom Event Branding', 'Unlock custom colors, banner images, and branding options for your event pages', 'host', 500, 'legend', 0.00)
ON CONFLICT DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE user_loyalty_status IS 'Current loyalty tier and point balance for each user (v2 system)';
COMMENT ON TABLE loyalty_point_transactions IS 'Ledger of all point transactions — both attendee and host activities';
COMMENT ON TABLE loyalty_tier_history IS 'Record of every tier change for audit and analytics';
COMMENT ON TABLE rewards IS 'Catalog of available rewards including host-specific perks';
COMMENT ON TABLE reward_redemptions IS 'User reward redemption records with fulfillment tracking';
COMMENT ON TABLE host_rewards IS 'Active host perks granted automatically based on tier progression';
COMMENT ON TABLE loyalty_experiments IS 'A/B testing framework for loyalty mechanics';
COMMENT ON TABLE loyalty_experiment_assignments IS 'User variant assignments for loyalty experiments';

COMMENT ON FUNCTION tier_rank IS 'Returns numeric rank for tier comparison (explorer=1, local=2, insider=3, legend=4)';
COMMENT ON FUNCTION award_loyalty_points IS 'Award points to a user for any activity (deduplicates by reference)';
COMMENT ON FUNCTION award_host_points IS 'Convenience wrapper for awarding host-specific activity points with validation';
COMMENT ON FUNCTION get_host_rewards IS 'Returns active host rewards for a user (own rewards or admin access)';
COMMENT ON FUNCTION redeem_loyalty_reward IS 'Redeem a reward — validates balance, tier, stock, and per-user limits';
COMMENT ON FUNCTION get_my_loyalty_summary IS 'Returns current user loyalty summary including host rewards and recent activity';
COMMENT ON FUNCTION auto_grant_host_rewards IS 'Trigger function: auto-grants host perks when tier changes, deactivates on downgrade';
