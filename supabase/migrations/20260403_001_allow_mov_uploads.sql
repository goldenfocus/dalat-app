-- Allow MOV (video/quicktime) uploads to moments bucket
-- MOV files are supported natively by modern browsers and don't need conversion

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime'  -- MOV files
]
WHERE id = 'moments';
