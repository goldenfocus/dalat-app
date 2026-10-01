-- Least-privilege Data API grants.
-- data-api-grants: least-privilege-backfill
--
-- On 2026-10-30 Supabase stops granting new public tables, views, and sequences
-- to anon, authenticated, and service_role. Tables that already exist on the
-- hosted project keep the grants they have. This migration does not revoke
-- anything, so on that project every statement is a no-op.
--
-- A database built from these migrations with auto_expose_new_tables = false
-- (local reset, preview branch, new project) does not get those default grants.
-- The statements below grant only what current callers need:
--   * service_role for supabase-js calls that use the service key
--   * authenticated for signed-in browser and cookie-session calls
--   * anon for logged-out pages, static generation, and realtime
-- RLS still decides which rows those roles can see. Grants are not policies.
--
-- No client insert writes a serial or identity column, so no sequence grant is
-- required. community_membership_activity's identity is filled by a
-- SECURITY DEFINER trigger running as the function owner.
--
-- Production grants that are broader than this file are left in place on purpose.
-- They are called out at the bottom of this file. Do not "fix" them here.


-- activity_candidates: Activity graph sync uses service_role.
grant select, insert, update on table public.activity_candidates to service_role;

-- activity_canonical_links: Activity graph sync uses service_role.
grant select, insert, update on table public.activity_canonical_links to service_role;

-- activity_evidence: Activity graph sync uses service_role.
grant select, insert, update on table public.activity_evidence to service_role;

-- activity_merge_decisions: Activity graph sync uses service_role.
grant insert on table public.activity_merge_decisions to service_role;

-- activity_observations: Activity graph sync uses service_role.
grant select, insert, update on table public.activity_observations to service_role;

-- activity_sources: Activity graph sync uses service_role. RLS is on and has no browser policies.
grant select, insert, update on table public.activity_sources to service_role;

-- blog_categories: Public blog pages and the static cache read categories.
grant select on table public.blog_categories to anon;
grant select on table public.blog_categories to authenticated;
grant select on table public.blog_categories to service_role;

-- blog_post_likes: Like counts for experimental posts use service_role. Visitors use the like RPCs.
grant select on table public.blog_post_likes to service_role;

-- blog_posts: Public blog and sitemap reads. News cron and recap jobs write with service_role. Editors update while signed in.
grant select on table public.blog_posts to anon;
grant select, update on table public.blog_posts to authenticated;
grant select, insert, update on table public.blog_posts to service_role;

-- caption_jobs: Workers claim and finish jobs with service_role. RLS is enabled and has no browser policies.
grant select, insert, update on table public.caption_jobs to service_role;

-- comments: Public comment lists use get_comments. Admin analytics and the translation sweep select the table.
grant select on table public.comments to authenticated;
grant select on table public.comments to service_role;

-- community_notification_preferences: Members read and update their mute flag while signed in. Fan-out reads with service_role.
grant select, insert, update on table public.community_notification_preferences to authenticated;
grant select on table public.community_notification_preferences to service_role;

-- community_visits: The intent route reads a visit with service_role. Browser roles were already revoked.
grant select on table public.community_visits to service_role;

-- content_pipeline_events: The news pipeline appends with service_role.
grant select, insert on table public.content_pipeline_events to service_role;

-- content_translations: Public pages and the static cache read translations. Editors delete their own. Workers write with service_role.
grant select on table public.content_translations to anon;
grant select, delete on table public.content_translations to authenticated;
grant select, insert, update, delete on table public.content_translations to service_role;

-- event_feedback: The signed-in event page reads the viewer's own feedback.
grant select on table public.event_feedback to authenticated;

-- event_invitations: The public invite page marks an invitation viewed while logged out, so anon can select and update. Creating invites requires a session. Blasts use service_role.
grant select, update on table public.event_invitations to anon;
grant select, insert, update on table public.event_invitations to authenticated;
grant select, insert, update on table public.event_invitations to service_role;

-- event_materials: Public event pages read materials. Hosts write them while signed in. Some jobs update with service_role.
grant select on table public.event_materials to anon;
grant select, insert, update, delete on table public.event_materials to authenticated;
grant select, update on table public.event_materials to service_role;

-- event_playlists: Public playlist and Open Graph routes read playlists. Hosts insert them while signed in.
grant select on table public.event_playlists to anon;
grant select, insert on table public.event_playlists to authenticated;

-- event_private_details: The event page and editor read and write as the signed-in host or guest. The morning-of notification cron reads with service_role. Logged-out reads are ignored by the page.
grant select, insert, update, delete on table public.event_private_details to authenticated;
grant select on table public.event_private_details to service_role;

-- event_questionnaires: The questionnaire builder is signed-in. Public RSVP uses get_event_questionnaire.
grant select, insert, update on table public.event_questionnaires to authenticated;

-- event_questions: The questionnaire builder is signed-in.
grant select, insert, delete on table public.event_questions to authenticated;

-- event_series: Public series pages read series. Editors write while signed in. Activity graph projection writes with service_role.
grant select on table public.event_series to anon;
grant select, insert, update, delete on table public.event_series to authenticated;
grant select, insert, update on table public.event_series to service_role;

-- event_settings: Public event and moment pages read settings. Hosts write them while signed in.
grant select on table public.event_settings to anon;
grant select, insert, update on table public.event_settings to authenticated;

-- event_sponsors: Public event pages embed sponsors. Hosts write the links while signed in.
grant select on table public.event_sponsors to anon;
grant select, insert, delete on table public.event_sponsors to authenticated;

-- events: Public pages and the static cache read events. Signed-in organizers write them. Importers and cron use service_role.
grant select on table public.events to anon;
grant select, insert, update, delete on table public.events to authenticated;
grant select, insert, update, delete on table public.events to service_role;

-- experience_media: Owners read media while signed in. The experience admin client writes it.
grant select on table public.experience_media to authenticated;
grant select, insert on table public.experience_media to service_role;

-- experience_sources: The owner editor reads sources. Generation writes them with service_role.
grant select on table public.experience_sources to authenticated;
grant select, insert, update on table public.experience_sources to service_role;

-- experience_venue_submissions: Submission review writes with service_role.
grant insert, update on table public.experience_venue_submissions to service_role;

-- experiences: Public experience pages read published rows. Authors insert drafts. Publishing uses service_role.
grant select on table public.experiences to anon;
grant select, insert on table public.experiences to authenticated;
grant update, delete on table public.experiences to service_role;

-- festival_events: Public festival pages read the lineup.
grant select on table public.festival_events to anon;

-- festival_organizers: Public festival pages embed organizers. RLS allows that read.
grant select on table public.festival_organizers to anon;
grant select on table public.festival_organizers to authenticated;

-- festival_updates: Public festival pages read updates.
grant select on table public.festival_updates to anon;

-- festivals: Public festival pages read published festivals. Organizers write while signed in.
grant select on table public.festivals to anon;
grant select, insert, update on table public.festivals to authenticated;

-- homepage_config: The public homepage reads config with the anon static client. Admins update it while signed in.
grant select on table public.homepage_config to anon;
grant select, update on table public.homepage_config to authenticated;

-- image_jobs: The signed-in user polls their own job. The worker writes with service_role.
grant select on table public.image_jobs to authenticated;
grant select, insert, update on table public.image_jobs to service_role;

-- image_versions: Restore and upload jobs use service_role.
grant select, insert, delete on table public.image_versions to service_role;

-- impersonation_sessions: Impersonation routes use service_role. The earlier migration already grants the superadmin session its own privileges.
grant select, insert, update on table public.impersonation_sessions to service_role;

-- import_queue: The import worker updates the queue with service_role.
grant select, update on table public.import_queue to service_role;

-- import_runs: Cron records runs with service_role.
grant select, insert on table public.import_runs to service_role;

-- live_streams: Viewers read streams. Hosts write them while signed in. Webhooks update with service_role.
grant select on table public.live_streams to anon;
grant select, insert, update, delete on table public.live_streams to authenticated;
grant select, update on table public.live_streams to service_role;

-- loyalty_point_transactions: History is loaded after the route checks the session.
grant select on table public.loyalty_point_transactions to authenticated;

-- moment_embeddings: Embedding jobs use service_role. Search uses the RPC.
grant select, insert, update, delete on table public.moment_embeddings to service_role;

-- moment_metadata: Public moment pages embed metadata. That select is already granted in 20260607_001. Workers read with service_role.
grant select on table public.moment_metadata to service_role;

-- moments: Public moment pages read published moments. Signed-in queries read further rows the policies allow. Workers update with service_role.
grant select on table public.moments to anon;
grant select on table public.moments to authenticated;
grant select, update on table public.moments to service_role;

-- muted_threads: Comment notification fan-out reads mutes with service_role.
grant select on table public.muted_threads to service_role;

-- news_raw_articles: The news pipeline writes with service_role.
grant select, insert, update on table public.news_raw_articles to service_role;

-- notification_preferences: Preference writes from the server use service_role.
grant select, insert, update on table public.notification_preferences to service_role;

-- notifications: The notification bell reads and updates the signed-in user's rows. Delivery inserts with service_role.
grant select, update on table public.notifications to authenticated;
grant insert, update on table public.notifications to service_role;

-- organizers: Public organizer pages read organizers. Owners write while signed in. Projection creates rows with service_role.
grant select on table public.organizers to anon;
grant select, insert, update, delete on table public.organizers to authenticated;
grant select, insert, update on table public.organizers to service_role;

-- personas: Admin screens write personas while signed in. Asset migration reads them with service_role.
grant select, insert, update, delete on table public.personas to authenticated;
grant select, update on table public.personas to service_role;

-- phuong_actions: Signed-in Phuong screens read actions.
grant select on table public.phuong_actions to authenticated;

-- phuong_idea_votes: Phuong members vote while signed in. Anon was already revoked, and authenticated has no delete.
grant select, insert, update on table public.phuong_idea_votes to authenticated;

-- phuong_members: Signed-in Phuong screens read membership.
grant select on table public.phuong_members to authenticated;

-- phuong_plan: Signed-in Phuong screens read the plan.
grant select on table public.phuong_plan to authenticated;

-- playlist_tracks: Playlist pages and Open Graph images read tracks. Editing is signed-in. Lyric backfill updates with service_role.
grant select on table public.playlist_tracks to anon;
grant select, insert, update, delete on table public.playlist_tracks to authenticated;
grant select, update on table public.playlist_tracks to service_role;

-- plus_one_guests: Check-in embeds plus_one_guests after the host is signed in. Writes go through SECURITY DEFINER functions.
grant select on table public.plus_one_guests to authenticated;

-- private_profile_details: A signed-in member reads their own biography. The earlier migration already grants that select.
grant select on table public.private_profile_details to authenticated;

-- profiles: Public profile pages read profiles. The owner updates their row. Scripts and signup helpers write with service_role.
grant select on table public.profiles to anon;
grant select, update on table public.profiles to authenticated;
grant select, insert, update on table public.profiles to service_role;

-- promo_media: Public pages read promo through get_event_promo_media. Organizers and the activity-graph worker write the table.
grant select, insert, delete on table public.promo_media to authenticated;
grant select, insert, update, delete on table public.promo_media to service_role;

-- push_subscriptions: The browser manages its own subscription. The push sender reads and deletes with service_role.
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select, delete on table public.push_subscriptions to service_role;

-- question_templates: The questionnaire builder reads templates while signed in.
grant select on table public.question_templates to authenticated;

-- rewards: The rewards catalog is loaded after the route checks the session.
grant select on table public.rewards to authenticated;

-- rsvp_cancellations: Cancellation recording from the signed-in client inserts a row.
grant insert on table public.rsvp_cancellations to authenticated;

-- rsvp_responses: Guests read and write their questionnaire answers while signed in.
grant select, insert, update on table public.rsvp_responses to authenticated;

-- rsvps: Logged-out pages and getCachedEventCounts read RSVP rows. Signed-in users write their own. Attendance recording uses service_role.
grant select on table public.rsvps to anon;
grant select, insert, update, delete on table public.rsvps to authenticated;
grant select, insert, update on table public.rsvps to service_role;

-- scheduled_notifications: The reminder scheduler uses service_role.
grant select, insert, update on table public.scheduled_notifications to service_role;

-- seed_profiles: Ghost setup writes this registry with service_role. Anon and authenticated were already revoked.
grant select, insert, update on table public.seed_profiles to service_role;

-- series_exceptions: Public series and calendar routes read exceptions.
grant select on table public.series_exceptions to anon;
grant select on table public.series_exceptions to authenticated;

-- series_rsvps: Public series pages read series RSVPs. Policies allow that read.
grant select on table public.series_rsvps to anon;
grant select on table public.series_rsvps to authenticated;

-- signup_intents: Auth continuation uses service_role. Anon and authenticated were already revoked.
grant select, insert, update, delete on table public.signup_intents to service_role;

-- sponsors: Public event pages embed sponsor records. Hosts write them while signed in.
grant select on table public.sponsors to anon;
grant select, insert, delete on table public.sponsors to authenticated;

-- stream_chat_messages: Live chat realtime subscriptions select rows. Sends and deletes go through RPCs.
grant select on table public.stream_chat_messages to anon;
grant select on table public.stream_chat_messages to authenticated;

-- tribe_invitations: Invite management is signed-in. This table deliberately has no anon USING (true) policy.
grant select, insert, update on table public.tribe_invitations to authenticated;

-- tribe_members: Membership checks run after sign-in. Notification fan-out reads with service_role.
grant select, update, delete on table public.tribe_members to authenticated;
grant select on table public.tribe_members to service_role;

-- tribe_requests: Request review is signed-in.
grant select, update on table public.tribe_requests to authenticated;

-- tribes: Public community pages read tribes. Members and leaders write while signed in. Some server routes read with service_role.
grant select on table public.tribes to anon;
grant select, insert, update, delete on table public.tribes to authenticated;
grant select on table public.tribes to service_role;

-- user_loyalty_status: The public leaderboard query runs as anon. RLS still returns only the caller's row (or an admin's view).
grant select on table public.user_loyalty_status to anon;
grant select on table public.user_loyalty_status to authenticated;

-- venue_managers: Venue admin screens manage managers while signed in.
grant select, insert, update, delete on table public.venue_managers to authenticated;

-- venues: Public venue pages read venues. Managers write while signed in. Backfills update with service_role.
grant select on table public.venues to anon;
grant select, insert, update, delete on table public.venues to authenticated;
grant select, update on table public.venues to service_role;

-- verification_requests: The signed-in user and moderators use the browser client. No anon access.
grant select, insert, update on table public.verification_requests to authenticated;

-- worker_heartbeats: Workers write heartbeats with service_role.
grant select, insert, update on table public.worker_heartbeats to service_role;

-- workshop_answers: The workshop route is signed-in. Anon was already revoked.
grant select, insert, update on table public.workshop_answers to authenticated;

-- Tables the app does not query through PostgREST. This file grants them
-- nothing. SECURITY DEFINER functions and the migration owner can still use
-- them. Production keeps whatever grants it already has.
--
-- Already granted by an earlier migration, so not repeated here:
-- account_acquisitions (authenticated select, service_role all),
-- community_invite_secrets and community_membership_activity (service_role all;
-- anon and authenticated revoked).

-- data-api-grant: none public.activity_sync_leases. Lease RPCs are SECURITY DEFINER.
-- data-api-grant: none public.contact_invites. Invite delivery uses SECURITY DEFINER helpers.
-- data-api-grant: none public.host_rewards. Host rewards are read through get_host_rewards.
-- data-api-grant: none public.invite_quotas. Quota checks use SECURITY DEFINER functions.
-- data-api-grant: none public.login_events. Reached only through SECURITY DEFINER functions.
-- data-api-grant: none public.loyalty_experiment_assignments.
-- data-api-grant: none public.loyalty_experiments.
-- data-api-grant: none public.loyalty_tier_history.
-- data-api-grant: none public.moment_likes. Likes go through toggle_moment_like and the count RPCs.
-- data-api-grant: none public.native_push_tokens. No Data API caller in this repo. RLS is own-row.
-- data-api-grant: none public.organizer_contacts. Same as tribe_contacts: no direct Data API caller in the app.
-- data-api-grant: none public.rate_limits. check_rate_limit is SECURITY DEFINER. Direct client writes would let a user reset their own counter.
-- data-api-grant: none public.reactions. Reactions go through toggle_reaction and get_reactions_batch.
-- data-api-grant: none public.reserved_slugs. Checked inside slug RPCs, not by the browser.
-- data-api-grant: none public.reward_redemptions. Redemptions go through redeem_loyalty_reward.
-- data-api-grant: none public.tribe_contacts. Contact lists are read through organizer RPCs or signed-in policies, not a direct Data API caller found in the app.
-- data-api-grant: none public.tribe_invite_quotas. Quota checks use SECURITY DEFINER functions.
-- data-api-grant: none public.unified_slug_migration_conflicts. One-time conflict log. RLS is off, so it must stay off the Data API on fresh databases.
-- data-api-grant: none public.unified_slugs. Slug resolution uses resolve_unified_slug.
-- data-api-grant: none public.user_follows. The activity feed reads follows inside SECURITY DEFINER functions.

-- Production grants this migration does not change
--
-- Hosted tables created while automatic exposure was on still have
-- select, insert, update, and delete for anon, authenticated, and
-- service_role, except where an earlier migration revoked them
-- (community_invite_secrets, community_visits, community_membership_activity,
-- signup_intents, seed_profiles, private_profile_details, account_acquisitions,
-- phuong_idea_votes, workshop_answers). This file does not revoke the leftovers.
--
-- Worth knowing, and intentionally not rewritten here:
-- * event_invitations SELECT and UPDATE policies are USING (true) / WITH CHECK (true).
--   Anon can read every invitation row and update any column. The public invite
--   page depends on the update.
-- * rsvps_select_public is user_id = auth.uid() OR the event row exists, so a
--   logged-out caller who can select rsvps can read every RSVP, not just a count.
--   getCachedEventCounts depends on that anon select.
-- * rate_limits policies allow the row owner to insert, update, and delete their
--   own counter. The app uses SECURITY DEFINER check_rate_limit instead.
-- * login_events is deny-all under RLS, but production still grants the Data API
--   roles full DML.
-- * impersonation_sessions grants authenticated select, insert, and update in
--   20260228_001. Production defaults also leave anon DML and authenticated
--   delete in place. RLS limits rows to the superadmin.
-- * plus_one_guests select was narrowed in 20261002_001, but the old table grants
--   to anon were not revoked. RLS blocks the rows.
-- * unified_slug_migration_conflicts has RLS disabled, so its production grants
--   expose the conflict log. It is not granted on a fresh database.
-- * unified_slug_migration_summary is a view without security_invoker, so a
--   production SELECT grant can bypass RLS of the tables underneath. It is not
--   granted here.
-- * user_loyalty_status is queried by the public leaderboard as anon, but RLS
--   only returns the caller's row or an admin's view, so logged-out callers get
--   an empty list rather than a directory.
-- * event_reminder_config, user_roles, and notes are queried from the app and
--   are not created by these migrations.
