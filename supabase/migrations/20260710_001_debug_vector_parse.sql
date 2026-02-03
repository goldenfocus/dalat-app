-- Debug function to test vector parsing from text
CREATE OR REPLACE FUNCTION debug_vector_parse(
  embedding_text text
)
RETURNS TABLE (
  input_length int,
  input_preview text,
  parsed_successfully boolean,
  vector_length int,
  vector_norm float,
  error_message text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parsed_vector vector(768);
  vec_length int;
  vec_norm float;
BEGIN
  input_length := length(embedding_text);
  input_preview := substring(embedding_text from 1 for 60) || '...' || substring(embedding_text from length(embedding_text) - 40);

  BEGIN
    -- Try to parse the text as vector
    parsed_vector := embedding_text::vector(768);
    parsed_successfully := true;
    vec_length := vector_dims(parsed_vector);
    -- Calculate L2 norm using pgvector's norm function
    vec_norm := vector_norm(parsed_vector);

    RETURN QUERY SELECT
      input_length,
      input_preview,
      parsed_successfully,
      vec_length,
      vec_norm,
      null::text;

  EXCEPTION WHEN OTHERS THEN
    parsed_successfully := false;
    RETURN QUERY SELECT
      input_length,
      input_preview,
      false::boolean,
      null::int,
      null::float,
      SQLERRM;
  END;
END;
$$;

-- Test function that compares text embedding against stored embeddings
-- This will reveal if the issue is with parsing or with the similarity calculation
CREATE OR REPLACE FUNCTION debug_compare_embeddings(
  test_embedding text
)
RETURNS TABLE (
  test_case text,
  result_count int,
  first_similarity float,
  error_msg text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  test_vec vector(768);
  stored_emb_text text;
  stored_vec vector(768);
BEGIN
  -- Get a stored embedding for comparison
  SELECT embedding::text INTO stored_emb_text FROM moment_embeddings LIMIT 1;
  stored_vec := stored_emb_text::vector(768);

  -- Try to parse the test embedding
  BEGIN
    test_vec := test_embedding::vector(768);
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT
      'parse_error'::text,
      0,
      null::float,
      SQLERRM;
    RETURN;
  END;

  -- Test 1: Search with the test embedding
  RETURN QUERY SELECT
    'search_with_test_emb'::text,
    (SELECT count(*)::int FROM moment_embeddings me
     WHERE 1 - (me.embedding <=> test_vec) > 0),
    (SELECT (1 - (me.embedding <=> test_vec))::float FROM moment_embeddings me
     ORDER BY me.embedding <=> test_vec LIMIT 1),
    null::text;

  -- Test 2: Search with stored embedding (control)
  RETURN QUERY SELECT
    'search_with_stored_emb'::text,
    (SELECT count(*)::int FROM moment_embeddings me
     WHERE 1 - (me.embedding <=> stored_vec) > 0),
    (SELECT (1 - (me.embedding <=> stored_vec))::float FROM moment_embeddings me
     ORDER BY me.embedding <=> stored_vec LIMIT 1),
    null::text;

  -- Test 3: Direct similarity between test and stored
  RETURN QUERY SELECT
    'direct_similarity'::text,
    1,
    (1 - (test_vec <=> stored_vec))::float,
    null::text;

  -- Test 4: Check norms
  RETURN QUERY SELECT
    'test_emb_norm'::text,
    1,
    vector_norm(test_vec)::float,
    null::text;

  RETURN QUERY SELECT
    'stored_emb_norm'::text,
    1,
    vector_norm(stored_vec)::float,
    null::text;
END;
$$;

GRANT EXECUTE ON FUNCTION debug_vector_parse(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION debug_compare_embeddings(text) TO anon, authenticated;
