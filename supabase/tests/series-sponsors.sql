-- Run after 20261127_001_series_sponsors.sql in a database with a profile.
-- All test records are drafts and the transaction is always rolled back.
BEGIN;

DO $$
DECLARE
  creator uuid;
  other_creator uuid;
  campaign_series_id uuid := gen_random_uuid();
  other_series_id uuid := gen_random_uuid();
  campaign_sponsor_id uuid := gen_random_uuid();
  explicit_sponsor_id uuid := gen_random_uuid();
  future_event_id uuid := gen_random_uuid();
  past_event_id uuid := gen_random_uuid();
  boundary_event_id uuid := gen_random_uuid();
  other_event_id uuid := gen_random_uuid();
  explicit_event_id uuid := gen_random_uuid();
  moved_event_id uuid := gen_random_uuid();
  wrong_owner_event_id uuid := gen_random_uuid();
  cutoff timestamptz := now();
BEGIN
  SELECT p.id INTO creator FROM public.profiles AS p
  ORDER BY p.created_at, p.id LIMIT 1;
  IF creator IS NULL THEN
    RAISE EXCEPTION 'series-sponsors fixture requires an existing profile';
  END IF;
  SELECT p.id INTO other_creator FROM public.profiles AS p
  WHERE p.id <> creator ORDER BY p.created_at, p.id LIMIT 1;
  IF other_creator IS NULL THEN
    -- The fixture needs a second identity to prove a creator cannot copy
    -- another owner's sponsorship by assigning that owner's series_id.
    other_creator := gen_random_uuid();
    INSERT INTO auth.users (id) VALUES (other_creator);
    INSERT INTO public.profiles (id) VALUES (other_creator) ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.event_series
    (id, slug, title, created_by, rrule, starts_at_time, first_occurrence, status)
  VALUES
    (campaign_series_id, 'test-series-sponsors-' || campaign_series_id, 'Sponsor test', creator,
     'FREQ=WEEKLY', '18:00:00', current_date, 'paused'),
    (other_series_id, 'test-series-sponsors-' || other_series_id, 'Other series', creator,
     'FREQ=WEEKLY', '18:00:00', current_date, 'paused');
  INSERT INTO public.sponsors (id, name, created_by) VALUES
    (campaign_sponsor_id, 'Series sponsor test', creator),
    (explicit_sponsor_id, 'Explicit sponsor test', creator);
  INSERT INTO public.series_sponsors
    (series_id, sponsor_id, sort_order)
  VALUES (campaign_series_id, campaign_sponsor_id, 3);
  IF NOT EXISTS (SELECT 1 FROM public.series_sponsors AS ss
                 WHERE ss.series_id = campaign_series_id AND ss.effective_from = cutoff) THEN
    RAISE EXCEPTION 'Series sponsorship did not default to its creation time';
  END IF;

  INSERT INTO public.events
    (id, slug, title, created_by, series_id, starts_at, status)
  VALUES
    (future_event_id, 'test-series-sponsors-' || future_event_id, 'Future', creator,
     campaign_series_id, cutoff + interval '7 days', 'draft'),
    (past_event_id, 'test-series-sponsors-' || past_event_id, 'Backfilled past', creator,
     campaign_series_id, cutoff - interval '7 days', 'draft'),
    (boundary_event_id, 'test-series-sponsors-' || boundary_event_id, 'Effective boundary', creator,
     campaign_series_id, cutoff, 'draft'),
    (other_event_id, 'test-series-sponsors-' || other_event_id, 'Other series', creator,
     other_series_id, cutoff + interval '7 days', 'draft'),
    (explicit_event_id, 'test-series-sponsors-' || explicit_event_id, 'Explicit links', creator,
     NULL, cutoff + interval '7 days', 'draft'),
    (moved_event_id, 'test-series-sponsors-' || moved_event_id, 'Rescheduled', creator,
     campaign_series_id, cutoff - interval '1 day', 'draft'),
    (wrong_owner_event_id, 'test-series-sponsors-' || wrong_owner_event_id, 'Wrong owner', other_creator,
     campaign_series_id, cutoff + interval '7 days', 'draft');

  IF (SELECT count(*) FROM public.event_sponsors AS es
      WHERE es.event_id = future_event_id AND es.sponsor_id = campaign_sponsor_id) <> 1 THEN
    RAISE EXCEPTION 'Future occurrence did not inherit exactly one sponsor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_sponsors AS es
                 WHERE es.event_id = future_event_id AND es.sort_order = 3) THEN
    RAISE EXCEPTION 'Series sponsor sort order was not inherited';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_sponsors AS es
             WHERE es.event_id IN (past_event_id, other_event_id, moved_event_id, wrong_owner_event_id)) THEN
    RAISE EXCEPTION 'Past, unrelated, or wrong-owner occurrence inherited sponsorship';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_sponsors AS es
                 WHERE es.event_id = boundary_event_id AND es.sponsor_id = campaign_sponsor_id) THEN
    RAISE EXCEPTION 'Effective date boundary was excluded';
  END IF;

  INSERT INTO public.event_sponsors (event_id, sponsor_id, sort_order) VALUES
    (explicit_event_id, campaign_sponsor_id, 9),
    (explicit_event_id, explicit_sponsor_id, 10);
  UPDATE public.events SET series_id = campaign_series_id
    WHERE id = explicit_event_id;
  UPDATE public.events SET starts_at = starts_at WHERE id = future_event_id;
  UPDATE public.events SET starts_at = cutoff + interval '1 day' WHERE id = moved_event_id;

  IF (SELECT count(*) FROM public.event_sponsors AS es
      WHERE es.event_id = future_event_id AND es.sponsor_id = campaign_sponsor_id) <> 1 THEN
    RAISE EXCEPTION 'Repeated trigger duplicated sponsorship';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_sponsors AS es
                 WHERE es.event_id = moved_event_id AND es.sponsor_id = campaign_sponsor_id) THEN
    RAISE EXCEPTION 'Rescheduled occurrence did not inherit sponsorship';
  END IF;
  IF (SELECT count(*) FROM public.event_sponsors AS es WHERE es.event_id = explicit_event_id) <> 2
     OR NOT EXISTS (SELECT 1 FROM public.event_sponsors AS es
                    WHERE es.event_id = explicit_event_id AND es.sponsor_id = campaign_sponsor_id AND es.sort_order = 9)
     OR NOT EXISTS (SELECT 1 FROM public.event_sponsors AS es
                    WHERE es.event_id = explicit_event_id AND es.sponsor_id = explicit_sponsor_id AND es.sort_order = 10) THEN
    RAISE EXCEPTION 'Inheritance changed explicit event sponsor links';
  END IF;

  IF NOT has_table_privilege('anon', 'public.series_sponsors', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.series_sponsors', 'SELECT')
     OR EXISTS (SELECT 1 FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privilege
                WHERE NOT has_table_privilege('service_role', 'public.series_sponsors', privilege)) THEN
    RAISE EXCEPTION 'Series sponsor Data API grants are incomplete';
  END IF;
  IF has_table_privilege('anon', 'public.series_sponsors', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     OR has_table_privilege('authenticated', 'public.series_sponsors', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
    RAISE EXCEPTION 'Public roles can modify series sponsorship';
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c
          WHERE c.oid = 'public.series_sponsors'::regclass) THEN
    RAISE EXCEPTION 'Series sponsor RLS is disabled';
  END IF;
  IF has_function_privilege('anon', 'public.inherit_series_sponsors()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.inherit_series_sponsors()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.inherit_series_sponsors()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Series sponsor trigger is exposed as an RPC';
  END IF;
END;
$$;

ROLLBACK;
