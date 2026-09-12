-- Run after the migration within a transaction and ROLLBACK. No fixture persists.
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('71000000-0000-4000-8000-000000000001','community-owner@example.invalid','{}'),
 ('71000000-0000-4000-8000-000000000002','community-member@example.invalid','{}'),
 ('71000000-0000-4000-8000-000000000003','community-banned@example.invalid','{}');
INSERT INTO profiles(id,username,display_name) VALUES
 ('71000000-0000-4000-8000-000000000001','qa_comm_owner','QA community owner'),
 ('71000000-0000-4000-8000-000000000002','qa_comm_member','QA community member'),
 ('71000000-0000-4000-8000-000000000003','qa_comm_banned','QA community banned') ON CONFLICT(id) DO UPDATE SET username=excluded.username;
INSERT INTO tribes(id,slug,name,created_by,access_type) VALUES
 ('72000000-0000-4000-8000-000000000001','qa-community-public','QA community','71000000-0000-4000-8000-000000000001','public'),
 ('72000000-0000-4000-8000-000000000002','qa-community-private','QA private community','71000000-0000-4000-8000-000000000001','invite_only');
INSERT INTO tribe_members(tribe_id,user_id,role,status) VALUES
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','leader','active'),
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003','member','banned') ON CONFLICT DO NOTHING;
CREATE FUNCTION pg_temp.expect_denied(statement text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
 RAISE EXCEPTION 'Security test unexpectedly allowed: %',statement;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.expect_denied($t$INSERT INTO tribe_members(tribe_id,user_id,role) VALUES('72000000-0000-4000-8000-000000000001',auth.uid(),'leader')$t$);
SELECT join_community('qa-community-public');
SELECT join_community('qa-community-public');
SELECT pg_temp.expect_denied($t$UPDATE tribe_members SET role='admin' WHERE user_id=auth.uid()$t$);
SELECT pg_temp.expect_denied($t$UPDATE tribe_members SET tribe_id='72000000-0000-4000-8000-000000000002' WHERE user_id=auth.uid()$t$);
SELECT pg_temp.expect_denied($t$UPDATE profiles SET role='admin' WHERE id=auth.uid()$t$);
SELECT pg_temp.expect_denied($t$SELECT regenerate_tribe_invite_code('72000000-0000-4000-8000-000000000002')$t$);
SELECT pg_temp.expect_denied($t$SELECT * FROM community_invite_secrets$t$);
SELECT pg_temp.expect_denied($t$SELECT transfer_community_ownership('qa-community-public','71000000-0000-4000-8000-000000000002')$t$);
UPDATE tribe_members SET show_on_profile=false WHERE user_id=auth.uid();
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.expect_denied($t$UPDATE tribe_members SET status='active' WHERE user_id=auth.uid()$t$);
SELECT pg_temp.expect_denied($t$DELETE FROM tribe_members WHERE user_id=auth.uid()$t$);
SELECT pg_temp.expect_denied($t$SELECT join_community('qa-community-public')$t$);
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
SELECT transfer_community_ownership('qa-community-public','71000000-0000-4000-8000-000000000002');
DO $$ BEGIN IF is_tribe_admin('72000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Former owner still admin'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT created_by FROM tribes WHERE slug='qa-community-public')<>'71000000-0000-4000-8000-000000000002'::uuid THEN RAISE EXCEPTION 'Ownership not transferred'; END IF;
 IF (SELECT founder_id FROM tribes WHERE slug='qa-community-public')<>'71000000-0000-4000-8000-000000000001'::uuid THEN RAISE EXCEPTION 'Founder lost'; END IF;
 IF EXISTS(SELECT 1 FROM tribes WHERE invite_code IS NOT NULL) THEN RAISE EXCEPTION 'Public invite code leak'; END IF;
END $$;
SELECT 'community security assertions passed' AS result;
-- An invitation can only be accepted by its addressed account, once, before expiry.
INSERT INTO tribe_invitations(tribe_id,invited_by,email,claimed_by,token,expires_at) VALUES
 ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','qa-invite@example.invalid','71000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000001',now()+interval '1 day'),
 ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','qa-expired@example.invalid',NULL,'74000000-0000-4000-8000-000000000002',now()-interval '1 day');
CREATE FUNCTION pg_temp.expect_rejected(statement text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN RETURN; END;
 RAISE EXCEPTION 'Test unexpectedly allowed: %',statement;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.expect_rejected($t$SELECT accept_community_invitation('74000000-0000-4000-8000-000000000001')$t$);
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.expect_rejected($t$SELECT accept_community_invitation('74000000-0000-4000-8000-000000000002')$t$);
SELECT accept_community_invitation('74000000-0000-4000-8000-000000000001');
SELECT accept_community_invitation('74000000-0000-4000-8000-000000000001');
RESET ROLE;
