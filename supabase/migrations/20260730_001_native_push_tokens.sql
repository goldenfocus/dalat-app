-- Native push tokens for iOS/Android app wrappers
-- Keeps web push subscriptions separate from native device tokens

CREATE TABLE native_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  platform text NOT NULL
    CHECK (platform IN ('ios', 'android')),
  device_token text NOT NULL,
  app_bundle_id text,
  device_id text,
  notification_mode text DEFAULT 'sound_and_vibration'
    CHECK (notification_mode IN ('sound_and_vibration', 'sound_only', 'vibration_only', 'silent')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, platform, device_token)
);
CREATE INDEX idx_native_push_tokens_user ON native_push_tokens(user_id);
CREATE INDEX idx_native_push_tokens_platform ON native_push_tokens(platform);
CREATE TRIGGER native_push_tokens_updated_at
  BEFORE UPDATE ON native_push_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE native_push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "native_push_tokens_select_own"
ON native_push_tokens FOR SELECT
USING (auth.uid() = user_id);
CREATE POLICY "native_push_tokens_insert_own"
ON native_push_tokens FOR INSERT
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "native_push_tokens_update_own"
ON native_push_tokens FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "native_push_tokens_delete_own"
ON native_push_tokens FOR DELETE
USING (auth.uid() = user_id);
