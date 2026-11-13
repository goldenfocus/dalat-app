BEGIN;
DO $$
DECLARE p jsonb := '{"speaks":[{"language":"vi","level":"native"}],"learning":{"language":"en","level":"beginner"},"additionalLearning":[{"language":"es","level":"new"}]}';
BEGIN
 IF NOT valid_event_language_preferences(p) THEN RAISE EXCEPTION 'multiple practice languages rejected'; END IF;
 IF NOT valid_event_language_preferences(p-'additionalLearning') THEN RAISE EXCEPTION 'legacy profile rejected'; END IF;
 IF valid_event_language_preferences(jsonb_set(p,'{additionalLearning}','[{"language":"en","level":"new"}]')) THEN RAISE EXCEPTION 'duplicate accepted'; END IF;
 IF valid_event_language_preferences(jsonb_set(p,'{additionalLearning}','[{"language":"xx","level":"new"}]')) THEN RAISE EXCEPTION 'unknown language accepted'; END IF;
 IF valid_event_language_preferences(jsonb_set(p,'{additionalLearning}','null')) THEN RAISE EXCEPTION 'null list accepted'; END IF;
END $$;
ROLLBACK;
