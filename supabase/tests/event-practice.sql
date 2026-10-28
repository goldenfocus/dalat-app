BEGIN;
DO $$
DECLARE v_event uuid; v_updated integer;
BEGIN
  IF has_table_privilege('anon','public.event_practice_rooms','SELECT') OR has_table_privilege('authenticated','public.event_practice_rooms','SELECT') THEN
    RAISE EXCEPTION 'Practice data must be service only';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.event_practice_rooms'::regclass) THEN RAISE EXCEPTION 'RLS missing'; END IF;
  SELECT id INTO v_event FROM events WHERE slug='language-exchange-social-house-z8oc-20261028';
  IF v_event IS NULL THEN RAISE EXCEPTION 'Test event missing'; END IF;
  IF EXISTS(SELECT 1 FROM event_practice_rooms WHERE event_id=v_event) THEN RAISE EXCEPTION 'Live practice already started; do not test this row'; END IF;
  INSERT INTO event_practice_rooms(event_id) VALUES(v_event);
  UPDATE event_practice_rooms SET revision=1 WHERE event_id=v_event AND revision=0;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  IF v_updated<>1 THEN RAISE EXCEPTION 'First update failed'; END IF;
  UPDATE event_practice_rooms SET revision=2 WHERE event_id=v_event AND revision=0;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  IF v_updated<>0 THEN RAISE EXCEPTION 'Stale update was accepted'; END IF;
END $$;
ROLLBACK;
