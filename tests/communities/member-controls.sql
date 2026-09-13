BEGIN;
CREATE TEMP TABLE menu_test_context AS
 SELECT tm.tribe_id,tm.user_id,t.created_by AS owner_id,
 (SELECT count(*) FROM rsvps r WHERE r.user_id=tm.user_id) AS rsvp_count
 FROM tribe_members tm JOIN tribes t ON t.id=tm.tribe_id
 WHERE t.slug='professionals' AND tm.status='active' AND tm.role='member' AND tm.user_id<>t.created_by LIMIT 1;
GRANT SELECT ON menu_test_context TO authenticated;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM menu_test_context) THEN RAISE EXCEPTION 'No test member'; END IF;
 PERFORM set_config('request.jwt.claim.sub',(SELECT user_id::text FROM menu_test_context),true);
END $$;
SET LOCAL ROLE authenticated;
INSERT INTO community_notification_preferences(tribe_id,user_id,muted)
 SELECT tribe_id,user_id,true FROM menu_test_context
 ON CONFLICT(tribe_id,user_id) DO UPDATE SET muted=true;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM community_notification_preferences p JOIN menu_test_context c USING(tribe_id,user_id) WHERE p.muted) THEN RAISE EXCEPTION 'Mute failed'; END IF;
 BEGIN
  INSERT INTO community_notification_preferences(tribe_id,user_id,muted) SELECT tribe_id,owner_id,true FROM menu_test_context;
  RAISE EXCEPTION 'Cross-user preference unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
UPDATE community_notification_preferences SET muted=false WHERE (tribe_id,user_id) IN (SELECT tribe_id,user_id FROM menu_test_context);
DELETE FROM tribe_members WHERE (tribe_id,user_id) IN (SELECT tribe_id,user_id FROM menu_test_context);
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM tribe_members m JOIN menu_test_context c USING(tribe_id,user_id)) THEN RAISE EXCEPTION 'Leave failed'; END IF;
 IF EXISTS(SELECT 1 FROM community_notification_preferences p JOIN menu_test_context c USING(tribe_id,user_id)) THEN RAISE EXCEPTION 'Preference cleanup failed'; END IF;
 IF (SELECT count(*) FROM rsvps WHERE user_id=(SELECT user_id FROM menu_test_context))<>(SELECT rsvp_count FROM menu_test_context) THEN RAISE EXCEPTION 'RSVPs changed'; END IF;
 PERFORM set_config('request.jwt.claim.sub',(SELECT owner_id::text FROM menu_test_context),true);
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  DELETE FROM tribe_members WHERE tribe_id=(SELECT tribe_id FROM menu_test_context) AND user_id=auth.uid();
  RAISE EXCEPTION 'Owner leave unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: mute, unmute, cross-user isolation, leave, RSVP preservation, preference cleanup, owner protection; rolled back' AS result;
