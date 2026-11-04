BEGIN;
DO $$ DECLARE cutoff timestamptz; BEGIN
 SELECT registration_cutoff_at INTO cutoff FROM event_drink_sponsors WHERE event_id='d6000000-0000-4000-8000-000000000001';
 IF cutoff IS DISTINCT FROM (((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+time '16:00') AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN RAISE EXCEPTION 'Wrong local cutoff: %',cutoff; END IF;
 IF (SELECT status FROM event_preorders WHERE id='d7000000-0000-4000-8000-000000000001')<>'pending' THEN RAISE EXCEPTION 'Early reservation changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM event_preorders WHERE id='d7000000-0000-4000-8000-000000000002' AND status='cancelled' AND sponsor_status='void' AND guest_due_vnd=0 AND paid_at IS NULL) THEN RAISE EXCEPTION 'Late free reservation not safely cancelled'; END IF;
 IF (SELECT receipt->'order'->>'status' FROM event_arrival_requests WHERE request_id='d8000000-0000-4000-8000-000000000009')<>'cancelled' THEN RAISE EXCEPTION 'Cached retry receipt still promises a free reservation'; END IF;
 IF (SELECT registered_at FROM language_exchange_rsvp_positions WHERE user_id='d1000000-0000-4000-8000-000000000001' AND event_id='d6000000-0000-4000-8000-000000000001')<>cutoff-interval '1 second' THEN RAISE EXCEPTION 'Historical registration evidence lost'; END IF;
END $$;
-- Use a deadline already passed to prove redemption time is not registration time.
UPDATE event_drink_sponsors SET registration_cutoff_at=now()-interval '1 minute' WHERE event_id='d6000000-0000-4000-8000-000000000001';
INSERT INTO auth.users(id) VALUES('d1000000-0000-4000-8000-000000000003'),('d1000000-0000-4000-8000-000000000004'),('d1000000-0000-4000-8000-000000000005'),('d1000000-0000-4000-8000-000000000006');
INSERT INTO profiles(id,username) VALUES('d1000000-0000-4000-8000-000000000003','cutoff_boundary'),('d1000000-0000-4000-8000-000000000004','cutoff_after'),('d1000000-0000-4000-8000-000000000005','cutoff_before'),('d1000000-0000-4000-8000-000000000006','cutoff_interested');
INSERT INTO rsvps(event_id,user_id,status,created_at) VALUES
 ('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000003','going',now()-interval '1 day'),
 ('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000004','going',now()-interval '1 day'),
 ('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000005','going',now()-interval '1 day'),
 ('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000006','interested',now()-interval '1 day');
UPDATE language_exchange_rsvp_positions SET registered_at=now()-interval '1 minute' WHERE user_id='d1000000-0000-4000-8000-000000000003';
UPDATE language_exchange_rsvp_positions SET registered_at=now()-interval '1 minute'+interval '1 second' WHERE user_id='d1000000-0000-4000-8000-000000000004';
UPDATE language_exchange_rsvp_positions SET registered_at=now()-interval '1 minute'-interval '1 second' WHERE user_id='d1000000-0000-4000-8000-000000000005';
UPDATE rsvps SET status='going' WHERE user_id='d1000000-0000-4000-8000-000000000006';
DO $$ DECLARE response jsonb; payload jsonb:='{"items":[{"item_id":"d5000000-0000-4000-8000-000000000001","qty":1}],"sponsoredItemId":"d5000000-0000-4000-8000-000000000001","registeredAt":"2000-01-01T00:00:00Z"}'; BEGIN
 IF NOT (arrival_sponsor_eligibility('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000005')->>'eligible')::boolean THEN RAISE EXCEPTION 'Early registration cannot redeem after cutoff'; END IF;
 IF (arrival_sponsor_eligibility('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000003')->>'eligible')::boolean THEN RAISE EXCEPTION 'Exact 4pm boundary eligible'; END IF;
 IF (arrival_sponsor_eligibility('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000004')->>'eligible')::boolean THEN RAISE EXCEPTION 'Late registration eligible'; END IF;
 IF (arrival_sponsor_eligibility('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000006')->>'eligible')::boolean THEN RAISE EXCEPTION 'Early interested status bypassed Going deadline'; END IF;
 BEGIN
  PERFORM arrival_reserve('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000004','d8000000-0000-4000-8000-000000000001',payload);
  RAISE EXCEPTION 'Late registration claimed free drink';
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'sponsor_limit_reached' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM event_preorders WHERE user_id='d1000000-0000-4000-8000-000000000004') THEN RAISE EXCEPTION 'Rejected reservation left an order'; END IF;
 response:=arrival_reserve('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000005','d8000000-0000-4000-8000-000000000002',payload);
 IF (response->'order'->>'sponsored_vnd')::integer<>40000 THEN RAISE EXCEPTION 'Early registration lost benefit'; END IF;
 UPDATE rsvps SET status='not_going' WHERE user_id='d1000000-0000-4000-8000-000000000005';
 UPDATE rsvps SET status='going' WHERE user_id='d1000000-0000-4000-8000-000000000005';
 IF (SELECT registered_at FROM language_exchange_rsvp_positions WHERE user_id='d1000000-0000-4000-8000-000000000005')<>now()-interval '61 seconds' THEN RAISE EXCEPTION 'Rejoining overwrote original evidence'; END IF;
END $$;
INSERT INTO events(id,series_id,venue_id,status,starts_at,ends_at,arrival_enabled) VALUES('d6000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','published','2030-02-02T18:00:00+07','2030-02-02T20:00:00+07',true);
DO $$ BEGIN
 IF (SELECT registration_cutoff_at FROM event_drink_sponsors WHERE event_id='d6000000-0000-4000-8000-000000000002')<>'2030-02-02T16:00:00+07'::timestamptz THEN RAISE EXCEPTION 'Future occurrence did not inherit local 4pm cutoff'; END IF;
END $$;
UPDATE events SET starts_at='2030-02-03T18:00:00+07' WHERE id='d6000000-0000-4000-8000-000000000002';
DO $$ BEGIN
 IF (SELECT registration_cutoff_at FROM event_drink_sponsors WHERE event_id='d6000000-0000-4000-8000-000000000002')<>'2030-02-03T16:00:00+07'::timestamptz THEN RAISE EXCEPTION 'Rescheduled occurrence kept wrong day cutoff'; END IF;
 IF has_function_privilege('anon','arrival_sponsor_eligibility(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Private eligibility became public'; END IF;
END $$;
ROLLBACK;
