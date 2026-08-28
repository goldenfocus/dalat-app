-- Activity Graph media discovery is source-scoped and rights-gated.
--
-- `reference_only` permits retaining advertised media URLs inside the private
-- source observation for change detection. It does not permit display,
-- hotlinking, transformation, or copying. A future source agreement can move
-- one registry row to a licensed mode without creating an event approval queue.

UPDATE activity_sources
SET metadata = metadata || jsonb_build_object(
  'media_policy', 'reference_only',
  'media_candidates_allowed', true,
  'media_reuse_allowed', false,
  'media_rights_basis', 'No media reuse grant recorded; robots access is not a content license.'
)
WHERE slug IN ('may-lang-thang', 'duoi-tan-anh-dao');

COMMENT ON COLUMN activity_sources.metadata IS
  'Source policy metadata. media_policy defaults to reference_only; public media reuse requires a recorded source-level rights basis.';
