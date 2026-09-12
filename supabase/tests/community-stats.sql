
SELECT record_community_visit('75000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','view','whatsapp','qa');
SELECT record_community_visit('75000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','view','whatsapp','qa');
SELECT record_community_visit('75000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','event_click','whatsapp','qa');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.expect_denied($t$SELECT get_community_stats('72000000-0000-4000-8000-000000000001')$t$);
SELECT pg_temp.expect_denied($t$SELECT * FROM community_visits$t$);
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
DO $$ DECLARE stats jsonb; BEGIN
 stats:=get_community_stats('72000000-0000-4000-8000-000000000001');
 IF (stats->>'visits')::int<>1 OR (stats->>'event_clicks')::int<>1 THEN RAISE EXCEPTION 'Visit deduplication failed'; END IF;
END $$;
RESET ROLE;
UPDATE profiles SET role='admin' WHERE id='71000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
SELECT get_community_stats('72000000-0000-4000-8000-000000000001');
RESET ROLE;
SELECT 'Community stats permissions and deduplication passed' result;
