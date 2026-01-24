-- Batch event counts RPC for efficient list views
-- Replaces client-side aggregation with server-side COUNT/SUM
-- Performance improvement: O(1) query vs O(n) filtering in JS

-- Create a composite type for the return value
DO $$ BEGIN
  CREATE TYPE event_counts_result AS (
    event_id uuid,
    going_count int,
    going_spots int,
    waitlist_count int,
    interested_count int
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Batch function to get counts for multiple events in one query
CREATE OR REPLACE FUNCTION get_event_counts_batch(p_event_ids uuid[])
RETURNS SETOF event_counts_result
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    event_id,
    count(*) FILTER (WHERE status = 'going')::int AS going_count,
    coalesce(sum(1 + plus_ones) FILTER (WHERE status = 'going'), 0)::int AS going_spots,
    count(*) FILTER (WHERE status = 'waitlist')::int AS waitlist_count,
    count(*) FILTER (WHERE status = 'interested')::int AS interested_count
  FROM rsvps
  WHERE event_id = ANY(p_event_ids)
  GROUP BY event_id;
$$;

-- Grant access to both anon and authenticated users (public event counts)
GRANT EXECUTE ON FUNCTION get_event_counts_batch(uuid[]) TO anon, authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_event_counts_batch IS
  'Batch fetch RSVP counts for multiple events. More efficient than calling get_event_counts() in a loop.';
