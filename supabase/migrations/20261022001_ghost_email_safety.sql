-- Synthetic accounts are product-internal identities, never email recipients.
-- Repair the seed roster created before is_ghost was set explicitly. Every auth
-- account under dalat.app is also opted out because the domain is a catch-all;
-- operational aliases such as claim@dalat.app are not auth accounts.

UPDATE profiles p
SET is_ghost = true
WHERE EXISTS (
  SELECT 1 FROM seed_profiles s WHERE s.profile_id = p.id
)
OR EXISTS (
  SELECT 1
  FROM auth.users u
  WHERE u.id = p.id
    AND (
      lower(u.email) LIKE 'ghost.%@dalat.app'
      OR lower(u.email) LIKE 'ghost\_%@dalat.app' ESCAPE '\'
      OR lower(u.email) LIKE 'ghost-%@dalat.app'
      OR lower(u.email) LIKE '%@placeholder.dalat.app'
    )
);

INSERT INTO notification_preferences (user_id, email_enabled)
SELECT u.id, false
FROM auth.users u
WHERE lower(u.email) LIKE '%@dalat.app'
   OR lower(u.email) LIKE '%@%.dalat.app'
ON CONFLICT (user_id) DO UPDATE
SET email_enabled = false,
    updated_at = now();

UPDATE scheduled_notifications sn
SET status = 'cancelled',
    error_message = 'Cancelled: dalat.app auth accounts cannot receive email',
    updated_at = now()
FROM auth.users u
WHERE u.id = sn.user_id
  AND (
    lower(u.email) LIKE '%@dalat.app'
    OR lower(u.email) LIKE '%@%.dalat.app'
  )
  AND sn.payload->'onlyChannels' = '["email"]'::jsonb
  AND sn.status IN ('pending', 'processing');
