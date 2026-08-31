-- The first retry decoded numeric entities only. Retry recent rows once more
-- now that full named HTML entities are normalized before evidence matching.
UPDATE news_raw_articles
SET
  status = 'pending',
  cluster_id = NULL,
  processed_at = NULL,
  error_message = NULL
WHERE status = 'error'
  AND published_at >= now() - interval '72 hours'
  AND error_message LIKE '%evidence-not-found%';
