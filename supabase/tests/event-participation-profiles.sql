-- Run against a migrated database in one session. All fixtures are rolled back.
BEGIN;
INSERT INTO auth.users (id, email)
VALUES ('3dc53513-0b12-44a3-a61e-f176742beccb', 'private-marker-participant@example.invalid'),
       ('6d124ba3-89f0-4e20-a28e-5c54ec2df33f', 'private-marker-test-host@example.invalid');

INSERT INTO public.events (id, slug, title, starts_at, created_by)
VALUES ('aa946c19-485e-4010-a989-4485faa39fce', 'qa-event-participation-identity', 'QA Event Identity',
        now() + interval '2 days', '6d124ba3-89f0-4e20-a28e-5c54ec2df33f');

INSERT INTO public.signup_intents (id, kind, target_id, token_hash, next_path, label, locale)
VALUES ('ef203c3f-d49c-4647-a223-bb887c2655ce', 'event', 'aa946c19-485e-4010-a989-4485faa39fce',
        'qa-identity-token', '/events/qa-event-participation-identity', 'QA Event Identity', 'vi');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"3dc53513-0b12-44a3-a61e-f176742beccb","role":"authenticated"}', true);

DO $$
DECLARE
  selected_username text;
  intent_locale text;
  receipt jsonb;
BEGIN
  SELECT username INTO selected_username FROM public.profiles WHERE id = auth.uid();
  IF selected_username IS NULL OR selected_username !~ '^dalat-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Signup did not assign a private-data-free handle';
  END IF;
  IF (public.resolve_unified_slug(selected_username)->>'entity_id')::uuid IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Default profile handle did not resolve';
  END IF;

  BEGIN
    PERFORM public.rsvp_event('aa946c19-485e-4010-a989-4485faa39fce');
    RAISE EXCEPTION 'RSVP bypassed the profile step';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'event_profile_required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.mark_interested('aa946c19-485e-4010-a989-4485faa39fce');
    RAISE EXCEPTION 'Interested bypassed the profile step';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'event_profile_required' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.events (slug, title, starts_at, created_by)
    VALUES ('qa-event-identity-created', 'QA Created Event', now() + interval '2 days', auth.uid());
    RAISE EXCEPTION 'Event creation bypassed the profile step';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'event_profile_required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.complete_signup_intent('ef203c3f-d49c-4647-a223-bb887c2655ce', 'qa-identity-token');
    RAISE EXCEPTION 'Signup intent did not pause for the profile';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS intent_locale = PG_EXCEPTION_DETAIL;
    IF SQLERRM <> 'event_profile_required' OR intent_locale IS DISTINCT FROM 'vi' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.profiles SET username = 'events' WHERE id = auth.uid();
    RAISE EXCEPTION 'A reserved username was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  UPDATE public.profiles SET display_name = 'Participation QA', username = 'qa-identity-fixture' WHERE id = auth.uid();
  IF (public.resolve_unified_slug(selected_username)->>'canonical_slug') IS DISTINCT FROM 'qa-identity-fixture' THEN
    RAISE EXCEPTION 'The generated handle lost its redirect after editing';
  END IF;
  receipt := public.complete_signup_intent('ef203c3f-d49c-4647-a223-bb887c2655ce', 'qa-identity-token');
  IF receipt->>'rsvp_status' IS DISTINCT FROM 'going' OR receipt->>'locale' IS DISTINCT FROM 'vi' THEN
    RAISE EXCEPTION 'Original RSVP intent failed to resume';
  END IF;

  INSERT INTO public.events (slug, title, starts_at, created_by)
  VALUES ('qa-event-identity-created', 'QA Created Event', now() + interval '2 days', auth.uid());
  IF NOT EXISTS (
    SELECT 1 FROM public.rsvps r JOIN public.events e ON e.id = r.event_id
    WHERE e.slug = 'qa-event-identity-created' AND r.user_id = auth.uid() AND r.status = 'going'
  ) THEN
    RAISE EXCEPTION 'Creator auto-RSVP did not survive the profile guard';
  END IF;
END
$$;
RESET ROLE;
ROLLBACK;
