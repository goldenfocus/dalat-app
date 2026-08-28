-- Đà Lạt Activity Graph v0
--
-- Additive truth/provenance layer around the existing public read models:
--   events       = scheduled occurrences
--   event_series = recurring schedules
--   venues / organizers / tribes = place, agent and community nodes
--
-- The graph tables are service-role only. Public activity pages continue to
-- read the existing event/series tables, while every automated projection is
-- traceable back to a versioned source observation and field-level evidence.

CREATE TABLE IF NOT EXISTS activity_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  canonical_url text NOT NULL,
  discovery_url text,
  page_path_prefix text,
  source_kind text NOT NULL CHECK (source_kind IN (
    'authorized_feed', 'official_calendar', 'first_party_venue',
    'licensed_partner', 'community_tip', 'search_discovery'
  )),
  fetch_mode text NOT NULL CHECK (fetch_mode IN (
    'api', 'ics', 'rss', 'json_ld_sitemap', 'verified_recurring_page',
    'webhook', 'manual'
  )),
  access_basis text NOT NULL CHECK (access_basis IN (
    'authorized_feed', 'public_api', 'first_party_page',
    'official_publication', 'licensed_partner', 'submission'
  )),
  trust_tier smallint NOT NULL DEFAULT 3 CHECK (trust_tier BETWEEN 1 AND 5),
  policy_status text NOT NULL DEFAULT 'pending' CHECK (policy_status IN (
    'pending', 'approved', 'blocked', 'needs_recheck'
  )),
  robots_url text,
  robots_checked_at timestamptz,
  terms_url text,
  terms_checked_at timestamptz,
  attribution_required boolean NOT NULL DEFAULT true,
  crawl_interval_minutes integer NOT NULL DEFAULT 1440
    CHECK (crawl_interval_minutes BETWEEN 15 AND 43200),
  max_items_per_run integer NOT NULL DEFAULT 25
    CHECK (max_items_per_run BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'paused' CHECK (status IN (
    'active', 'paused', 'blocked', 'degraded'
  )),
  auto_publish_enabled boolean NOT NULL DEFAULT false,
  auto_publish_threshold smallint NOT NULL DEFAULT 95
    CHECK (auto_publish_threshold BETWEEN 0 AND 100),
  organizer_id uuid REFERENCES organizers(id) ON DELETE SET NULL,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  tribe_id uuid REFERENCES tribes(id) ON DELETE SET NULL,
  discovered_from_source_id uuid REFERENCES activity_sources(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_changed_at timestamptz,
  last_error_at timestamptz,
  error_detail text,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS activity_sources_canonical_url_key
  ON activity_sources (lower(canonical_url));
CREATE INDEX IF NOT EXISTS activity_sources_due_idx
  ON activity_sources (next_check_at, trust_tier)
  WHERE status = 'active' AND policy_status = 'approved';

CREATE TABLE IF NOT EXISTS activity_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES activity_sources(id) ON DELETE CASCADE,
  source_uid text NOT NULL,
  source_url text NOT NULL,
  content_hash text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_published_at timestamptz,
  source_updated_at timestamptz,
  http_status integer,
  content_type text,
  etag text,
  last_modified text,
  extraction_method text NOT NULL,
  extractor_version text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  structured_payload jsonb,
  extraction_status text NOT NULL CHECK (extraction_status IN (
    'parsed', 'unchanged', 'rejected', 'failed'
  )),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_observation_revision_unique
    UNIQUE (source_id, source_uid, content_hash)
);

CREATE INDEX IF NOT EXISTS activity_observations_source_time_idx
  ON activity_observations (source_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS activity_observations_uid_time_idx
  ON activity_observations (source_id, source_uid, fetched_at DESC);

CREATE TABLE IF NOT EXISTS activity_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES activity_sources(id) ON DELETE CASCADE,
  latest_observation_id uuid NOT NULL REFERENCES activity_observations(id) ON DELETE RESTRICT,
  source_uid text NOT NULL,
  source_url text NOT NULL,
  activity_kind text NOT NULL CHECK (activity_kind IN (
    'event', 'recurring_activity', 'exhibition', 'workshop', 'class',
    'performance', 'market', 'religious_activity', 'sports',
    'community_activity', 'seasonal_activity', 'bookable_experience', 'other'
  )),
  title text NOT NULL,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  time_precision text NOT NULL DEFAULT 'exact' CHECK (time_precision IN (
    'exact', 'approximate', 'date_only', 'tba', 'recurring'
  )),
  rrule text,
  starts_at_time time,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  first_occurrence date,
  rrule_until timestamptz,
  location_name text,
  address text,
  latitude double precision,
  longitude double precision,
  organizer_name text,
  organizer_url text,
  price_type text CHECK (price_type IS NULL OR price_type IN ('free', 'paid', 'donation')),
  ticket_tiers jsonb,
  ticket_url text,
  reservation_requirement text CHECK (
    reservation_requirement IS NULL OR reservation_requirement IN (
      'not_required', 'recommended', 'required', 'unknown'
    )
  ),
  public_access text NOT NULL DEFAULT 'unknown' CHECK (public_access IN (
    'confirmed', 'restricted', 'unknown'
  )),
  normalized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  confidence_components jsonb NOT NULL DEFAULT '{}'::jsonb,
  freshness_score smallint NOT NULL DEFAULT 100 CHECK (freshness_score BETWEEN 0 AND 100),
  locality_status text NOT NULL CHECK (locality_status IN (
    'confirmed', 'outside', 'unknown'
  )),
  duplicate_status text NOT NULL DEFAULT 'unchecked' CHECK (duplicate_status IN (
    'unchecked', 'distinct', 'matched', 'ambiguous'
  )),
  duplicate_matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision text NOT NULL CHECK (decision IN (
    'publish', 'update', 'merge', 'withhold', 'reject', 'unlist'
  )),
  decision_reason text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'discovered', 'published', 'withheld', 'rejected', 'unlisted',
    'stale', 'cancelled', 'failed'
  )),
  discovered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  missing_runs integer NOT NULL DEFAULT 0 CHECK (missing_runs >= 0),
  unlist_origin text CHECK (
    unlist_origin IS NULL OR unlist_origin IN ('admin', 'system_stale')
  ),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz,
  source_updated_at timestamptz,
  next_check_at timestamptz,
  stale_after timestamptz,
  published_at timestamptz,
  admin_action_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  admin_action_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_candidate_source_uid_unique UNIQUE (source_id, source_uid),
  CONSTRAINT activity_candidate_schedule_shape CHECK (
    (activity_kind = 'recurring_activity' AND rrule IS NOT NULL AND starts_at_time IS NOT NULL)
    OR activity_kind <> 'recurring_activity'
  )
);

CREATE INDEX IF NOT EXISTS activity_candidates_status_time_idx
  ON activity_candidates (status, last_checked_at DESC);
CREATE INDEX IF NOT EXISTS activity_candidates_source_time_idx
  ON activity_candidates (source_id, last_checked_at DESC);
CREATE INDEX IF NOT EXISTS activity_candidates_next_check_idx
  ON activity_candidates (next_check_at)
  WHERE status IN ('published', 'withheld', 'stale');
CREATE INDEX IF NOT EXISTS activity_candidates_stale_source_idx
  ON activity_candidates (source_id, stale_after)
  WHERE status = 'published' AND stale_after IS NOT NULL;

CREATE TABLE IF NOT EXISTS activity_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES activity_candidates(id) ON DELETE CASCADE,
  observation_id uuid NOT NULL REFERENCES activity_observations(id) ON DELETE CASCADE,
  field_path text NOT NULL,
  raw_value jsonb,
  normalized_value jsonb,
  evidence_text text,
  evidence_locator text,
  evidence_hash text,
  is_explicit boolean NOT NULL DEFAULT true,
  confidence smallint NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  observed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_evidence_field_revision_unique
    UNIQUE (candidate_id, observation_id, field_path)
);

CREATE INDEX IF NOT EXISTS activity_evidence_candidate_idx
  ON activity_evidence (candidate_id, field_path);

CREATE TABLE IF NOT EXISTS activity_canonical_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES activity_sources(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL UNIQUE REFERENCES activity_candidates(id) ON DELETE CASCADE,
  observation_id uuid NOT NULL REFERENCES activity_observations(id) ON DELETE RESTRICT,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  event_series_id uuid REFERENCES event_series(id) ON DELETE CASCADE,
  relationship text NOT NULL CHECK (relationship IN (
    'primary', 'corroborating', 'reschedule_notice', 'cancellation_notice'
  )),
  is_primary boolean NOT NULL DEFAULT false,
  is_official boolean NOT NULL DEFAULT false,
  selected_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_canonical_link_one_target
    CHECK (num_nonnulls(event_id, event_series_id) = 1)
);

CREATE INDEX IF NOT EXISTS activity_canonical_links_event_idx
  ON activity_canonical_links (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activity_canonical_links_series_idx
  ON activity_canonical_links (event_series_id) WHERE event_series_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS activity_merge_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES activity_candidates(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  event_series_id uuid REFERENCES event_series(id) ON DELETE CASCADE,
  classification text NOT NULL CHECK (classification IN (
    'same_occurrence', 'same_series_other_occurrence', 'related', 'distinct'
  )),
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  feature_vector jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text NOT NULL CHECK (decision IN ('linked', 'kept_distinct', 'withheld')),
  algorithm_version text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_merge_decision_target_shape CHECK (
    classification = 'distinct' OR num_nonnulls(event_id, event_series_id) = 1
  )
);

CREATE INDEX IF NOT EXISTS activity_merge_decisions_candidate_idx
  ON activity_merge_decisions (candidate_id, created_at DESC);

-- A short database-backed lease serializes scheduled graph runs across Vercel
-- instances. Expired leases can always be reclaimed, so a terminated function
-- can delay the next run but can never permanently stop ingestion.
CREATE TABLE IF NOT EXISTS activity_sync_leases (
  name text PRIMARY KEY,
  owner_id uuid NOT NULL,
  acquired_at timestamptz NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_sync_lease_window_check
    CHECK (lease_expires_at > acquired_at)
);

-- Compatibility fields on the public read models. Null means "legacy/unknown";
-- no evidence is fabricated during rollout.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS activity_kind text,
  ADD COLUMN IF NOT EXISTS public_access text,
  ADD COLUMN IF NOT EXISTS reservation_requirement text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS freshness_score smallint,
  ADD COLUMN IF NOT EXISTS activity_graph_candidate_id uuid
    REFERENCES activity_candidates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activity_admin_suppressed_at timestamptz,
  ADD COLUMN IF NOT EXISTS activity_admin_suppressed_by uuid
    REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE event_series
  ADD COLUMN IF NOT EXISTS activity_kind text,
  ADD COLUMN IF NOT EXISTS public_access text,
  ADD COLUMN IF NOT EXISTS reservation_requirement text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS freshness_score smallint,
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activity_graph_candidate_id uuid
    REFERENCES activity_candidates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activity_admin_suppressed_at timestamptz,
  ADD COLUMN IF NOT EXISTS activity_admin_suppressed_by uuid
    REFERENCES profiles(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT events_activity_kind_check CHECK (
    activity_kind IS NULL OR activity_kind IN (
      'event', 'recurring_activity', 'exhibition', 'workshop', 'class',
      'performance', 'market', 'religious_activity', 'sports',
      'community_activity', 'seasonal_activity', 'bookable_experience', 'other'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE event_series ADD CONSTRAINT event_series_activity_kind_check CHECK (
    activity_kind IS NULL OR activity_kind IN (
      'recurring_activity', 'workshop', 'class', 'performance', 'market',
      'religious_activity', 'sports', 'community_activity', 'other'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT events_public_access_check CHECK (
    public_access IS NULL OR public_access IN ('confirmed', 'restricted', 'unknown')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE event_series ADD CONSTRAINT event_series_public_access_check CHECK (
    public_access IS NULL OR public_access IN ('confirmed', 'restricted', 'unknown')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT events_freshness_score_check CHECK (
    freshness_score IS NULL OR freshness_score BETWEEN 0 AND 100
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE event_series ADD CONSTRAINT event_series_freshness_score_check CHECK (
    freshness_score IS NULL OR freshness_score BETWEEN 0 AND 100
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS events_activity_kind_idx
  ON events (activity_kind) WHERE activity_kind IS NOT NULL;
CREATE INDEX IF NOT EXISTS event_series_activity_kind_idx
  ON event_series (activity_kind) WHERE activity_kind IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS events_activity_graph_candidate_key
  ON events (activity_graph_candidate_id)
  WHERE activity_graph_candidate_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS event_series_activity_graph_candidate_key
  ON event_series (activity_graph_candidate_id)
  WHERE activity_graph_candidate_id IS NOT NULL;
-- PostgreSQL permits multiple NULL pairs, so this protects only real series
-- occurrences and remains compatible with standalone events.
CREATE UNIQUE INDEX IF NOT EXISTS events_series_instance_unique
  ON events (series_id, series_instance_date);

CREATE TRIGGER activity_sources_updated_at
  BEFORE UPDATE ON activity_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER activity_candidates_updated_at
  BEFORE UPDATE ON activity_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER activity_canonical_links_updated_at
  BEFORE UPDATE ON activity_canonical_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Service role only. Admin access is mediated by authenticated server routes.
ALTER TABLE activity_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_canonical_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_merge_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_sync_leases ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE activity_sources IS 'Policy-cleared monitored sources for the Da Lat Activity Graph';
COMMENT ON TABLE activity_observations IS 'Versioned source observations keyed by source item and content hash';
COMMENT ON TABLE activity_candidates IS 'Normalized activity candidates plus automatic publication decision trace';
COMMENT ON TABLE activity_evidence IS 'Field-level source evidence; unknown fields have no assertion row';
COMMENT ON TABLE activity_canonical_links IS 'Traceable projection from a candidate to one public event or series';
COMMENT ON TABLE activity_sync_leases IS 'Expiring singleton leases for Activity Graph background runs';

CREATE OR REPLACE FUNCTION claim_activity_sync_lease(
  p_name text,
  p_owner_id uuid,
  p_now timestamptz,
  p_ttl_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'lease_name_required';
  END IF;
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'lease_owner_required';
  END IF;
  IF p_ttl_seconds < 30 OR p_ttl_seconds > 900 THEN
    RAISE EXCEPTION 'lease_ttl_out_of_range';
  END IF;

  INSERT INTO activity_sync_leases (
    name, owner_id, acquired_at, lease_expires_at, updated_at
  ) VALUES (
    trim(p_name),
    p_owner_id,
    p_now,
    p_now + make_interval(secs => p_ttl_seconds),
    p_now
  )
  ON CONFLICT (name) DO UPDATE SET
    owner_id = EXCLUDED.owner_id,
    acquired_at = EXCLUDED.acquired_at,
    lease_expires_at = EXCLUDED.lease_expires_at,
    updated_at = EXCLUDED.updated_at
  WHERE activity_sync_leases.lease_expires_at <= p_now
     OR activity_sync_leases.owner_id = p_owner_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION release_activity_sync_lease(
  p_name text,
  p_owner_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  DELETE FROM activity_sync_leases
  WHERE name = trim(p_name)
    AND owner_id = p_owner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION claim_activity_sync_lease(text, uuid, timestamptz, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION release_activity_sync_lease(text, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_activity_sync_lease(text, uuid, timestamptz, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION release_activity_sync_lease(text, uuid)
  TO service_role;

-- Hide only projections owned by the Activity Graph. If another published
-- candidate corroborates the same canonical target, that target stays live.
-- Creator-managed and legacy-imported content is never mutated here.
CREATE OR REPLACE FUNCTION suppress_activity_candidate_projection(
  p_candidate_id uuid,
  p_hidden_at timestamptz,
  p_event_status text DEFAULT 'draft'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id uuid;
  v_series_id uuid;
  v_event_hidden integer := 0;
  v_series_hidden integer := 0;
BEGIN
  IF p_event_status NOT IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_projection_event_status';
  END IF;

  SELECT event_id, event_series_id
  INTO v_event_id, v_series_id
  FROM activity_canonical_links
  WHERE candidate_id = p_candidate_id;

  IF v_event_id IS NOT NULL THEN
    UPDATE events AS target_event
    SET status = p_event_status
    WHERE target_event.id = v_event_id
      AND target_event.source_platform = 'activity-graph'
      AND NOT EXISTS (
        SELECT 1
        FROM activity_canonical_links AS other_link
        JOIN activity_candidates AS other_candidate
          ON other_candidate.id = other_link.candidate_id
        WHERE other_link.event_id = target_event.id
          AND other_link.candidate_id <> p_candidate_id
          AND other_candidate.status = 'published'
      );
    GET DIAGNOSTICS v_event_hidden = ROW_COUNT;
  END IF;

  IF v_series_id IS NOT NULL THEN
    UPDATE event_series AS target_series
    SET status = 'paused'
    WHERE target_series.id = v_series_id
      AND target_series.source_platform = 'activity-graph'
      AND NOT EXISTS (
        SELECT 1
        FROM activity_canonical_links AS other_link
        JOIN activity_candidates AS other_candidate
          ON other_candidate.id = other_link.candidate_id
        WHERE other_link.event_series_id = target_series.id
          AND other_link.candidate_id <> p_candidate_id
          AND other_candidate.status = 'published'
      );
    GET DIAGNOSTICS v_series_hidden = ROW_COUNT;

    IF v_series_hidden = 1 THEN
      UPDATE events
      SET status = 'draft'
      WHERE series_id = v_series_id
        AND source_platform = 'activity-graph'
        AND starts_at >= p_hidden_at;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'event_hidden', v_event_hidden = 1,
    'series_hidden', v_series_hidden = 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_unlist_activity_candidate(
  p_candidate_id uuid,
  p_admin_id uuid,
  p_unlisted_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id uuid;
  v_series_id uuid;
  v_rows integer := 0;
  v_target_owned boolean := false;
BEGIN
  PERFORM 1
  FROM activity_candidates
  WHERE id = p_candidate_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'activity_candidate_not_found';
  END IF;

  SELECT event_id, event_series_id
  INTO v_event_id, v_series_id
  FROM activity_canonical_links
  WHERE candidate_id = p_candidate_id;

  IF v_event_id IS NOT NULL THEN
    UPDATE events
    SET
      status = 'draft',
      activity_admin_suppressed_at = p_unlisted_at,
      activity_admin_suppressed_by = p_admin_id
    WHERE id = v_event_id
      AND source_platform = 'activity-graph';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_target_owned := v_rows = 1;
  ELSIF v_series_id IS NOT NULL THEN
    UPDATE event_series
    SET
      status = 'paused',
      activity_admin_suppressed_at = p_unlisted_at,
      activity_admin_suppressed_by = p_admin_id
    WHERE id = v_series_id
      AND source_platform = 'activity-graph';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_target_owned := v_rows = 1;

    IF v_target_owned THEN
      UPDATE events
      SET status = 'draft'
      WHERE series_id = v_series_id
        AND source_platform = 'activity-graph'
        AND starts_at >= p_unlisted_at;
    END IF;
  END IF;

  -- For an owned graph projection, one click is authoritative for the visible
  -- canonical target, so every graph assertion linked to it is suppressed.
  -- For creator-managed content, detach only the selected graph assertion.
  UPDATE activity_candidates AS candidate
  SET
    status = 'unlisted',
    decision = 'unlist',
    decision_reason = 'Unlisted by administrator; automatic republish suppressed',
    unlist_origin = 'admin',
    admin_action_by = p_admin_id,
    admin_action_at = p_unlisted_at,
    next_check_at = NULL
  WHERE candidate.id = p_candidate_id
     OR (
       v_target_owned
       AND candidate.id IN (
         SELECT link.candidate_id
         FROM activity_canonical_links AS link
         WHERE (v_event_id IS NOT NULL AND link.event_id = v_event_id)
            OR (v_series_id IS NOT NULL AND link.event_series_id = v_series_id)
       )
     );

  RETURN jsonb_build_object(
    'candidate_unlisted', true,
    'target_owned_by_activity_graph', v_target_owned,
    'projection_hidden', v_target_owned
  );
END;
$$;

-- Final publication is one transaction: candidate provenance becomes current
-- only if the admin has not suppressed it, then the owned target becomes
-- visible. A process death before this function leaves only draft/paused rows.
CREATE OR REPLACE FUNCTION finalize_activity_candidate_publication(
  p_candidate_id uuid,
  p_observation_id uuid,
  p_decision text,
  p_reason text,
  p_duplicate_status text,
  p_duplicate_matches jsonb,
  p_freshness_score integer,
  p_confirmed_at timestamptz,
  p_published_new boolean,
  p_occurrence_dates date[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_latest_observation_id uuid;
  v_unlist_origin text;
  v_event_id uuid;
  v_series_id uuid;
  v_source_platform text;
  v_suppressed_at timestamptz;
  v_suppressed_by uuid;
  v_target_owned boolean := false;
BEGIN
  IF p_decision NOT IN ('publish', 'update', 'merge') THEN
    RAISE EXCEPTION 'invalid_publication_decision';
  END IF;
  IF p_duplicate_status NOT IN ('distinct', 'matched') THEN
    RAISE EXCEPTION 'invalid_publication_duplicate_status';
  END IF;
  IF p_freshness_score < 0 OR p_freshness_score > 100 THEN
    RAISE EXCEPTION 'invalid_publication_freshness_score';
  END IF;

  SELECT latest_observation_id, unlist_origin
  INTO v_latest_observation_id, v_unlist_origin
  FROM activity_candidates
  WHERE id = p_candidate_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'activity_candidate_not_found';
  END IF;
  IF v_latest_observation_id <> p_observation_id THEN
    RETURN jsonb_build_object('published', false, 'reason', 'superseded_observation');
  END IF;
  IF v_unlist_origin = 'admin' THEN
    RETURN jsonb_build_object('published', false, 'reason', 'admin_suppressed');
  END IF;

  SELECT event_id, event_series_id
  INTO v_event_id, v_series_id
  FROM activity_canonical_links
  WHERE candidate_id = p_candidate_id;
  IF v_event_id IS NULL AND v_series_id IS NULL THEN
    RAISE EXCEPTION 'activity_canonical_link_missing';
  END IF;

  IF v_event_id IS NOT NULL THEN
    SELECT source_platform, activity_admin_suppressed_at, activity_admin_suppressed_by
    INTO v_source_platform, v_suppressed_at, v_suppressed_by
    FROM events
    WHERE id = v_event_id
    FOR UPDATE;
  ELSE
    SELECT source_platform, activity_admin_suppressed_at, activity_admin_suppressed_by
    INTO v_source_platform, v_suppressed_at, v_suppressed_by
    FROM event_series
    WHERE id = v_series_id
    FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'activity_canonical_target_missing';
  END IF;
  v_target_owned := v_source_platform = 'activity-graph';

  IF v_target_owned AND v_suppressed_at IS NOT NULL THEN
    UPDATE activity_candidates
    SET
      status = 'unlisted',
      decision = 'unlist',
      decision_reason = 'Canonical Activity Graph listing is suppressed by an administrator',
      unlist_origin = 'admin',
      admin_action_by = v_suppressed_by,
      admin_action_at = v_suppressed_at,
      next_check_at = NULL,
      freshness_score = 0
    WHERE id = p_candidate_id;
    RETURN jsonb_build_object('published', false, 'reason', 'target_admin_suppressed');
  END IF;

  UPDATE activity_candidates
  SET
    status = 'published',
    decision = p_decision,
    decision_reason = p_reason,
    duplicate_status = p_duplicate_status,
    duplicate_matches = COALESCE(p_duplicate_matches, '[]'::jsonb),
    published_at = CASE
      WHEN p_published_new THEN COALESCE(published_at, p_confirmed_at)
      ELSE published_at
    END,
    last_checked_at = p_confirmed_at,
    last_confirmed_at = p_confirmed_at,
    freshness_score = p_freshness_score,
    unlist_origin = NULL,
    missing_runs = 0
  WHERE id = p_candidate_id;

  IF v_event_id IS NOT NULL AND v_target_owned THEN
    UPDATE events
    SET status = 'published'
    WHERE id = v_event_id
      AND activity_admin_suppressed_at IS NULL;
  ELSIF v_series_id IS NOT NULL AND v_target_owned THEN
    UPDATE event_series
    SET status = 'active'
    WHERE id = v_series_id
      AND activity_admin_suppressed_at IS NULL;
    UPDATE events
    SET status = 'published'
    WHERE series_id = v_series_id
      AND source_platform = 'activity-graph'
      AND starts_at >= p_confirmed_at
      AND NOT COALESCE(is_exception, false)
      AND (
        p_occurrence_dates IS NULL
        OR series_instance_date = ANY(p_occurrence_dates)
      );
  END IF;

  RETURN jsonb_build_object(
    'published', true,
    'target_owned_by_activity_graph', v_target_owned,
    'event_id', v_event_id,
    'event_series_id', v_series_id
  );
END;
$$;

-- Health-check fallback for imported recurring activities. The pause and all
-- future occurrence drafts happen in one transaction.
CREATE OR REPLACE FUNCTION pause_stale_activity_graph_series(
  p_series_id uuid,
  p_paused_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_source_platform text;
  v_suppressed_at timestamptz;
  v_last_confirmed_at timestamptz;
BEGIN
  SELECT status, source_platform, activity_admin_suppressed_at, last_confirmed_at
  INTO v_status, v_source_platform, v_suppressed_at, v_last_confirmed_at
  FROM event_series
  WHERE id = p_series_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_source_platform <> 'activity-graph'
     OR v_status <> 'active'
     OR v_suppressed_at IS NOT NULL
     OR (
       v_last_confirmed_at IS NOT NULL
       AND v_last_confirmed_at >= p_paused_at - interval '14 days'
     ) THEN
    RETURN false;
  END IF;

  UPDATE event_series
  SET status = 'paused', freshness_score = 0
  WHERE id = p_series_id;

  UPDATE events
  SET status = 'draft', freshness_score = 0
  WHERE series_id = p_series_id
    AND source_platform = 'activity-graph'
    AND starts_at >= p_paused_at;
  RETURN true;
END;
$$;

-- Health top-up inserts graph occurrences as drafts, then uses this function
-- as the only publication boundary. Locking the current series row makes an
-- administrator's suppression authoritative even when it races a cron run.
CREATE OR REPLACE FUNCTION publish_verified_activity_graph_series_occurrences(
  p_series_id uuid,
  p_occurrence_dates date[],
  p_published_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_source_platform text;
  v_suppressed_at timestamptz;
  v_last_confirmed_at timestamptz;
  v_published integer := 0;
BEGIN
  SELECT status, source_platform, activity_admin_suppressed_at, last_confirmed_at
  INTO v_status, v_source_platform, v_suppressed_at, v_last_confirmed_at
  FROM event_series
  WHERE id = p_series_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('published', false, 'reason', 'series_missing');
  END IF;
  IF v_source_platform <> 'activity-graph'
     OR v_status <> 'active'
     OR v_suppressed_at IS NOT NULL THEN
    RETURN jsonb_build_object('published', false, 'reason', 'series_not_publishable');
  END IF;
  IF v_last_confirmed_at IS NULL
     OR v_last_confirmed_at < p_published_at - interval '14 days' THEN
    RETURN jsonb_build_object('published', false, 'reason', 'source_confirmation_stale');
  END IF;
  IF cardinality(COALESCE(p_occurrence_dates, ARRAY[]::date[])) = 0 THEN
    RETURN jsonb_build_object('published', true, 'count', 0);
  END IF;

  UPDATE events
  SET status = 'published'
  WHERE series_id = p_series_id
    AND source_platform = 'activity-graph'
    AND series_instance_date = ANY(p_occurrence_dates)
    AND starts_at >= p_published_at
    AND NOT COALESCE(is_exception, false);
  GET DIAGNOSTICS v_published = ROW_COUNT;

  RETURN jsonb_build_object('published', true, 'count', v_published);
END;
$$;

REVOKE ALL ON FUNCTION suppress_activity_candidate_projection(uuid, timestamptz, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_unlist_activity_candidate(uuid, uuid, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION finalize_activity_candidate_publication(uuid, uuid, text, text, text, jsonb, integer, timestamptz, boolean, date[])
  FROM PUBLIC;
REVOKE ALL ON FUNCTION pause_stale_activity_graph_series(uuid, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION publish_verified_activity_graph_series_occurrences(uuid, date[], timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION suppress_activity_candidate_projection(uuid, timestamptz, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION admin_unlist_activity_candidate(uuid, uuid, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION finalize_activity_candidate_publication(uuid, uuid, text, text, text, jsonb, integer, timestamptz, boolean, date[])
  TO service_role;
GRANT EXECUTE ON FUNCTION pause_stale_activity_graph_series(uuid, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION publish_verified_activity_graph_series_occurrences(uuid, date[], timestamptz)
  TO service_role;

-- Two policy-cleared, deterministic starter lanes. Auto-publish remains
-- constrained by code-level locality/evidence gates and the high per-source
-- threshold. Sources begin paused for a controlled production smoke; the
-- deployment step activates them only after the schema and code are live.
INSERT INTO activity_sources (
  slug, name, canonical_url, discovery_url, page_path_prefix,
  source_kind, fetch_mode, access_basis, trust_tier, policy_status,
  robots_url, robots_checked_at, terms_checked_at,
  crawl_interval_minutes, max_items_per_run, status,
  auto_publish_enabled, auto_publish_threshold, metadata
) VALUES
  (
    'may-lang-thang',
    'Mây Lang Thang',
    'https://maylangthang.com.vn',
    'https://maylangthang.com.vn/sitemap.xml',
    '/shows/',
    'first_party_venue',
    'json_ld_sitemap',
    'first_party_page',
    1,
    'approved',
    'https://maylangthang.com.vn/robots.txt',
    '2026-08-28T00:00:00Z',
    '2026-08-28T00:00:00Z',
    60,
    25,
    'paused',
    true,
    95,
    '{"policy_note":"First-party show pages; robots permits /shows and sitemap discovery. Facts and source links only; no page copy or image reuse.","locality_rule":"explicit_da_lat_or_verified_coordinates"}'::jsonb
  ),
  (
    'duoi-tan-anh-dao',
    'Dưới Tán Anh Đào',
    'https://duoitananhdao.com',
    'https://duoitananhdao.com/en/',
    '/',
    'first_party_venue',
    'verified_recurring_page',
    'first_party_page',
    1,
    'approved',
    'https://duoitananhdao.com/robots.txt',
    '2026-08-28T00:00:00Z',
    '2026-08-28T00:00:00Z',
    10080,
    1,
    'paused',
    true,
    97,
    '{"policy_note":"First-party public venue page with explicit nightly schedule, address and no-cover wording. Facts and source links only; no image reuse.","adapter":"duoi_tan_acoustic_v1"}'::jsonb
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  canonical_url = EXCLUDED.canonical_url,
  discovery_url = EXCLUDED.discovery_url,
  page_path_prefix = EXCLUDED.page_path_prefix,
  source_kind = EXCLUDED.source_kind,
  fetch_mode = EXCLUDED.fetch_mode,
  access_basis = EXCLUDED.access_basis,
  trust_tier = EXCLUDED.trust_tier,
  policy_status = EXCLUDED.policy_status,
  robots_url = EXCLUDED.robots_url,
  robots_checked_at = EXCLUDED.robots_checked_at,
  terms_checked_at = EXCLUDED.terms_checked_at,
  crawl_interval_minutes = EXCLUDED.crawl_interval_minutes,
  max_items_per_run = EXCLUDED.max_items_per_run,
  status = EXCLUDED.status,
  auto_publish_enabled = EXCLUDED.auto_publish_enabled,
  auto_publish_threshold = EXCLUDED.auto_publish_threshold,
  metadata = EXCLUDED.metadata,
  next_check_at = now();

-- Keep all system-driven unlisting transactional. Canonical content with
-- another currently published candidate stays live, and creator-managed
-- content is never mutated by the Activity Graph.
CREATE OR REPLACE FUNCTION apply_activity_candidate_system_unlist(
  p_candidate_ids uuid[],
  p_unlisted_at timestamptz,
  p_reason text,
  p_future_events_only boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_candidate_ids uuid[] := COALESCE(p_candidate_ids, ARRAY[]::uuid[]);
  v_paused_series_ids uuid[] := ARRAY[]::uuid[];
  v_unlisted integer := 0;
BEGIN
  IF cardinality(v_candidate_ids) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE events AS target_event
  SET status = 'draft'
  FROM activity_canonical_links AS link
  WHERE link.candidate_id = ANY(v_candidate_ids)
    AND link.event_id = target_event.id
    AND target_event.source_platform = 'activity-graph'
    AND (NOT p_future_events_only OR target_event.starts_at >= p_unlisted_at)
    AND NOT EXISTS (
      SELECT 1
      FROM activity_canonical_links AS other_link
      JOIN activity_candidates AS other_candidate
        ON other_candidate.id = other_link.candidate_id
      WHERE other_link.event_id = target_event.id
        AND other_link.candidate_id <> link.candidate_id
        AND NOT (other_link.candidate_id = ANY(v_candidate_ids))
        AND other_candidate.status = 'published'
    );

  SELECT COALESCE(array_agg(DISTINCT target_series.id), ARRAY[]::uuid[])
  INTO v_paused_series_ids
  FROM event_series AS target_series
  JOIN activity_canonical_links AS link
    ON link.event_series_id = target_series.id
  WHERE link.candidate_id = ANY(v_candidate_ids)
    AND target_series.source_platform = 'activity-graph'
    AND NOT EXISTS (
      SELECT 1
      FROM activity_canonical_links AS other_link
      JOIN activity_candidates AS other_candidate
        ON other_candidate.id = other_link.candidate_id
      WHERE other_link.event_series_id = target_series.id
        AND other_link.candidate_id <> link.candidate_id
        AND NOT (other_link.candidate_id = ANY(v_candidate_ids))
        AND other_candidate.status = 'published'
    );

  UPDATE event_series
  SET status = 'paused'
  WHERE id = ANY(v_paused_series_ids);

  UPDATE events
  SET status = 'draft'
  WHERE series_id = ANY(v_paused_series_ids)
    AND starts_at >= p_unlisted_at;

  UPDATE activity_candidates
  SET
    status = 'unlisted',
    decision = 'unlist',
    decision_reason = p_reason,
    unlist_origin = 'system_stale',
    freshness_score = 0,
    next_check_at = NULL,
    last_checked_at = p_unlisted_at
  WHERE id = ANY(v_candidate_ids)
    AND status = 'published';
  GET DIAGNOSTICS v_unlisted = ROW_COUNT;

  RETURN v_unlisted;
END;
$$;

REVOKE ALL ON FUNCTION apply_activity_candidate_system_unlist(uuid[], timestamptz, text, boolean)
  FROM PUBLIC;

-- Advance disappearance counters only after the caller has completed an
-- authoritative source inventory pass. The function is transactional: a
-- partial target/candidate update can never count as one of the two misses.
CREATE OR REPLACE FUNCTION reconcile_activity_source_disappearances(
  p_source_id uuid,
  p_seen_source_uids text[],
  p_seen_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seen_source_uids text[] := COALESCE(p_seen_source_uids, ARRAY[]::text[]);
  v_incremented integer := 0;
  v_stale_candidate_ids uuid[] := ARRAY[]::uuid[];
  v_unlisted integer := 0;
BEGIN
  UPDATE activity_candidates
  SET
    last_seen_at = p_seen_at,
    missing_runs = 0
  WHERE source_id = p_source_id
    AND source_uid = ANY(v_seen_source_uids);

  WITH incremented AS (
    UPDATE activity_candidates
    SET
      missing_runs = missing_runs + 1,
      last_checked_at = p_seen_at
    WHERE source_id = p_source_id
      AND status = 'published'
      AND NOT (source_uid = ANY(v_seen_source_uids))
    RETURNING id, missing_runs
  )
  SELECT
    count(*)::integer,
    COALESCE(
      array_agg(id) FILTER (WHERE missing_runs >= 2),
      ARRAY[]::uuid[]
    )
  INTO v_incremented, v_stale_candidate_ids
  FROM incremented;

  IF cardinality(v_stale_candidate_ids) > 0 THEN
    v_unlisted := apply_activity_candidate_system_unlist(
      v_stale_candidate_ids,
      p_seen_at,
      'Automatically unlisted after two complete source runs did not contain this source item',
      false
    );
  END IF;

  RETURN jsonb_build_object(
    'incremented', v_incremented,
    'unlisted', v_unlisted
  );
END;
$$;

REVOKE ALL ON FUNCTION reconcile_activity_source_disappearances(uuid, text[], timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reconcile_activity_source_disappearances(uuid, text[], timestamptz)
  TO service_role;

-- Freshness expiry is independent from inventory completeness. A source outage
-- never fabricates a disappearance strike, but it also cannot leave stale
-- future activities public indefinitely.
CREATE OR REPLACE FUNCTION expire_stale_activity_source_candidates(
  p_source_id uuid,
  p_checked_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stale_candidate_ids uuid[] := ARRAY[]::uuid[];
  v_unlisted integer := 0;
BEGIN
  SELECT COALESCE(array_agg(stale_candidate.id), ARRAY[]::uuid[])
  INTO v_stale_candidate_ids
  FROM (
    SELECT candidate.id
    FROM activity_candidates AS candidate
    WHERE candidate.source_id = p_source_id
      AND candidate.status = 'published'
      AND candidate.stale_after IS NOT NULL
      AND candidate.stale_after <= p_checked_at
    FOR UPDATE
  ) AS stale_candidate;

  IF cardinality(v_stale_candidate_ids) > 0 THEN
    v_unlisted := apply_activity_candidate_system_unlist(
      v_stale_candidate_ids,
      p_checked_at,
      'Automatically unlisted after its source confirmation freshness deadline elapsed',
      true
    );
  END IF;

  RETURN jsonb_build_object('unlisted', v_unlisted);
END;
$$;

REVOKE ALL ON FUNCTION expire_stale_activity_source_candidates(uuid, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION expire_stale_activity_source_candidates(uuid, timestamptz)
  TO service_role;

-- Global sweep is deliberately independent from source status. Pausing or
-- blocking a source stops fetching but cannot strand its old one-off events
-- in public discovery past their freshness deadline.
CREATE OR REPLACE FUNCTION expire_all_stale_activity_candidates(
  p_checked_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stale_candidate_ids uuid[] := ARRAY[]::uuid[];
  v_unlisted integer := 0;
BEGIN
  SELECT COALESCE(array_agg(stale_candidate.id), ARRAY[]::uuid[])
  INTO v_stale_candidate_ids
  FROM (
    SELECT candidate.id
    FROM activity_candidates AS candidate
    WHERE candidate.status = 'published'
      AND candidate.stale_after IS NOT NULL
      AND candidate.stale_after <= p_checked_at
    FOR UPDATE
  ) AS stale_candidate;

  IF cardinality(v_stale_candidate_ids) > 0 THEN
    v_unlisted := apply_activity_candidate_system_unlist(
      v_stale_candidate_ids,
      p_checked_at,
      'Automatically unlisted after its source confirmation freshness deadline elapsed',
      true
    );
  END IF;

  RETURN jsonb_build_object('unlisted', v_unlisted);
END;
$$;

REVOKE ALL ON FUNCTION expire_all_stale_activity_candidates(timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION expire_all_stale_activity_candidates(timestamptz)
  TO service_role;
