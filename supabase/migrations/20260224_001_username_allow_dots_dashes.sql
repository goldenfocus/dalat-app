-- Allow dots and dashes in usernames
-- Rules: 3-20 chars, must start/end with letter or number, no consecutive special chars

-- Drop old constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS valid_username;

-- Add new constraint allowing dots and dashes
-- Pattern: starts with alphanumeric, middle can have ._-, ends with alphanumeric
-- OR exactly 3 alphanumeric chars (minimum length edge case)
-- Also forbids consecutive special characters
ALTER TABLE profiles ADD CONSTRAINT valid_username
  CHECK (
    username IS NULL
    OR (
      username ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$'
      AND length(username) >= 3
      AND length(username) <= 20
      AND username !~ '[._-]{2,}'
    )
  );
