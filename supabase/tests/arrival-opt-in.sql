BEGIN;
DO $$
BEGIN
 IF (SELECT count(*) FROM event_series WHERE arrival_enabled)<>1 THEN RAISE EXCEPTION 'Wrong series opted in'; END IF;
 IF (SELECT count(*) FROM events WHERE arrival_enabled)<>2 THEN RAISE EXCEPTION 'Backfill changed past or unrelated occurrences'; END IF;
 IF NOT (SELECT arrival_enabled FROM events WHERE id='92000000-0000-4000-8000-000000000001') OR
 NOT (SELECT arrival_enabled FROM events WHERE id='92000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Launch future/current occurrence missing opt-in'; END IF;
 INSERT INTO events(id,series_id,status,starts_at) VALUES
 ('92000000-0000-4000-8000-000000000006','91000000-0000-4000-8000-000000000001','published',now()+interval '8 days'),
 ('92000000-0000-4000-8000-000000000007','91000000-0000-4000-8000-000000000002','published',now()+interval '8 days'),
 ('92000000-0000-4000-8000-000000000008',NULL,'published',now()+interval '8 days');
 IF NOT (SELECT arrival_enabled FROM events WHERE id='92000000-0000-4000-8000-000000000006') THEN RAISE EXCEPTION 'New occurrence failed to inherit opt-in'; END IF;
 IF EXISTS(SELECT 1 FROM events WHERE id IN ('92000000-0000-4000-8000-000000000007','92000000-0000-4000-8000-000000000008') AND arrival_enabled) THEN RAISE EXCEPTION 'Default opted in unrelated event'; END IF;
 UPDATE events SET arrival_enabled=false WHERE id='92000000-0000-4000-8000-000000000006';
 IF (SELECT arrival_enabled FROM events WHERE id='92000000-0000-4000-8000-000000000006') THEN RAISE EXCEPTION 'Individual opt-out overwritten'; END IF;
 IF has_function_privilege('anon','inherit_event_arrival_opt_in()','EXECUTE') OR has_function_privilege('service_role','inherit_event_arrival_opt_in()','EXECUTE') THEN RAISE EXCEPTION 'Internal trigger became RPC'; END IF;
END $$;
ROLLBACK;
DELETE FROM events WHERE id::text LIKE '92000000-%';
DELETE FROM event_series WHERE id::text LIKE '91000000-%';
