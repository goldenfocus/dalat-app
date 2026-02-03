#!/bin/bash
# Backfill embeddings with rate limiting (6 per batch, 10s internal delay)

for i in $(seq 1 50); do
  echo "=== Batch $i/50 ==="
  result=$(curl -s "https://dalat.app/api/cron/backfill-embeddings?limit=6&delay=10000")
  echo "$result" | jq -c '{processed, success, errors, skipped}'

  # Check if we're done (no more to process)
  processed=$(echo "$result" | jq '.processed')
  if [ "$processed" = "0" ]; then
    echo "=== All done! No more moments to process ==="
    break
  fi

  if [ "$i" -lt 50 ]; then
    echo "Waiting 5s before next batch..."
    sleep 5
  fi
done

echo "=== Backfill complete ==="
