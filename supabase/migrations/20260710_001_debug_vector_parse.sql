-- Debug function to test vector parsing from text
CREATE OR REPLACE FUNCTION debug_vector_parse(
  embedding_text text
)
RETURNS TABLE (
  input_length int,
  input_preview text,
  parsed_successfully boolean,
  vector_length int,
  first_three_elements text,
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
  first_three text;
BEGIN
  input_length := length(embedding_text);
  input_preview := substring(embedding_text from 1 for 50) || '...' || substring(embedding_text from length(embedding_text) - 30);

  BEGIN
    -- Try to parse the text as vector
    parsed_vector := embedding_text::vector(768);
    parsed_successfully := true;
    vec_length := vector_dims(parsed_vector);

    -- Get first 3 elements as text
    first_three := (SELECT string_agg(v::text, ', ') FROM (SELECT unnest(parsed_vector::float[]) AS v LIMIT 3) sub);

    RETURN QUERY SELECT
      input_length,
      input_preview,
      parsed_successfully,
      vec_length,
      first_three,
      null::text;

  EXCEPTION WHEN OTHERS THEN
    parsed_successfully := false;
    RETURN QUERY SELECT
      input_length,
      input_preview,
      false::boolean,
      null::int,
      null::text,
      SQLERRM;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION debug_vector_parse(text) TO anon, authenticated;
