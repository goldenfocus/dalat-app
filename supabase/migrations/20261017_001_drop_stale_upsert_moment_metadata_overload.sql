-- The 20260711 karaoke migration added p_lyrics_lrc to upsert_moment_metadata
-- via CREATE OR REPLACE, which — because the parameter list changed — created
-- a SECOND overload instead of replacing the function (same failure class as
-- the create_moment incident: adding a param needs DROP, not REPLACE).
--
-- With both overloads present, every named-param RPC call is ambiguous and
-- PostgREST rejects it ("Could not choose the best candidate function"),
-- which broke the AI captioning cron on its first live run.
--
-- Drop the old 26-param version; the surviving 27-param version is a strict
-- superset (p_lyrics_lrc defaults to NULL) so all named-param callers match
-- it unambiguously.

DROP FUNCTION IF EXISTS upsert_moment_metadata(
  uuid, text, text, text[], text, text, double precision, text, text[],
  text[], integer, text[], text[], text, text, text[], text, text, text,
  text, text, integer, text[], text, text, integer
);

NOTIFY pgrst, 'reload schema';
