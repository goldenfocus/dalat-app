-- God Mode: User impersonation for super admin
-- Tracks all impersonation sessions for audit purposes

CREATE TABLE impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  target_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,

  CONSTRAINT different_users CHECK (admin_user_id <> target_user_id)
);

-- Indexes for efficient queries
CREATE INDEX idx_impersonation_admin ON impersonation_sessions(admin_user_id);
CREATE INDEX idx_impersonation_target ON impersonation_sessions(target_user_id);
CREATE INDEX idx_impersonation_active ON impersonation_sessions(admin_user_id)
  WHERE ended_at IS NULL;

-- RLS: Only super admin (yan) can access impersonation logs
ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "impersonation_sessions_superadmin_only"
ON impersonation_sessions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND username = 'yan'
  )
);

-- Grant access to authenticated users (RLS will filter)
GRANT SELECT, INSERT, UPDATE ON impersonation_sessions TO authenticated;
