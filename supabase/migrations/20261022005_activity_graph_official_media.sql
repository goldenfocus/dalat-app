-- The product owner has chosen canonical first-party promotional media over
-- generated fact-art for the two launch sources. These assets remain remote
-- embeds from the official source (not copied into ĐàLạt.app storage), retain
-- source attribution, and can be disabled once per source without introducing
-- an event approval queue.

UPDATE activity_sources
SET metadata = metadata || jsonb_build_object(
  'media_policy', 'official_source_embed',
  'media_reuse_allowed', true,
  'media_delivery', 'remote_embed',
  'media_rights_basis', 'Owner-directed canonical first-party promotional embed with attribution; disable on takedown or source policy change.',
  'attribution_text', name
)
WHERE slug IN ('may-lang-thang', 'duoi-tan-anh-dao');

COMMENT ON COLUMN activity_sources.metadata IS
  'Source policy metadata. Official media display is source-scoped, attributed, remotely embedded, and reversible without event-by-event approval.';
