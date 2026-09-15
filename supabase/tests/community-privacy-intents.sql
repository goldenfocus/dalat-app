-- Follows community-security.sql fixtures in the same rolled-back transaction.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
UPDATE profiles SET bio='QA private biography sentinel' WHERE id=auth.uid();
UPDATE profiles SET is_private=true WHERE id=auth.uid();
UPDATE profiles SET is_private=true WHERE id=auth.uid();
DO $$ BEGIN
 IF (SELECT bio FROM profiles WHERE id=auth.uid()) IS NOT NULL THEN RAISE EXCEPTION 'Private bio remained public'; END IF;
 IF (SELECT bio FROM private_profile_details WHERE user_id=auth.uid())<>'QA private biography sentinel' THEN RAISE EXCEPTION 'Owner lost private bio'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM private_profile_details) THEN RAISE EXCEPTION 'Private bio leaked to another member'; END IF; END $$;
RESET ROLE;
INSERT INTO signup_intents(id,token_hash,kind,target_id,community_id,join_community,next_path,label,created_at)
 VALUES('73000000-0000-4000-8000-000000000001','qa-hash','community','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001',true,'/communities/qa-community-public','QA community',now());
UPDATE auth.users SET created_at=now()-interval '1 day' WHERE id='71000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.expect_denied($t$SELECT complete_signup_intent('73000000-0000-4000-8000-000000000001','wrong')$t$);
SELECT complete_signup_intent('73000000-0000-4000-8000-000000000001','qa-hash');
SELECT complete_signup_intent('73000000-0000-4000-8000-000000000001','qa-hash');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.expect_denied($t$SELECT complete_signup_intent('73000000-0000-4000-8000-000000000001','qa-hash')$t$);
UPDATE profiles SET bio='' WHERE id=auth.uid();
DO $$ BEGIN IF (SELECT bio FROM private_profile_details WHERE user_id=auth.uid()) IS NOT NULL THEN RAISE EXCEPTION 'Private bio could not be cleared'; END IF; END $$;
UPDATE profiles SET bio='QA updated private biography' WHERE id=auth.uid();
UPDATE profiles SET is_private=false WHERE id=auth.uid();
DO $$ BEGIN IF (SELECT bio FROM profiles WHERE id=auth.uid())<>'QA updated private biography' THEN RAISE EXCEPTION 'Public restore lost changes'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM account_acquisitions WHERE user_id='71000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Existing user reacquired'; END IF; END $$;
-- A new account can be attributed without making the owner the explicit inviter.
UPDATE auth.users SET created_at=now() WHERE id='71000000-0000-4000-8000-000000000003';
INSERT INTO signup_intents(id,token_hash,kind,target_id,community_id,join_community,next_path,label,created_at)
 VALUES('73000000-0000-4000-8000-000000000002','qa-new-hash','community','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001',true,'/communities/qa-community-public','QA community',now()-interval '1 second');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
SELECT complete_signup_intent('73000000-0000-4000-8000-000000000002','qa-new-hash');
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM account_acquisitions WHERE user_id='71000000-0000-4000-8000-000000000003' AND inviter_id IS NULL AND owner_at_signup='71000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Acquisition dimensions incorrect'; END IF;
 IF (SELECT result->>'community_status' FROM signup_intents WHERE id='73000000-0000-4000-8000-000000000002')<>'failed' THEN RAISE EXCEPTION 'Ban bypassed by auth continuation'; END IF;
END $$;
SELECT 'community permissions, privacy and auth intent assertions passed' AS result;

UPDATE tribes SET short_slug='qa-community-handle' WHERE slug='qa-community-public';
DO $$ BEGIN IF (resolve_unified_slug('qa-community-handle')->>'entity_type')<>'community' THEN RAISE EXCEPTION 'Community handle failed'; END IF; END $$;
