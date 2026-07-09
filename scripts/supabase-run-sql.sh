#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# supabase-run-sql.sh — Run SQL against Supabase via Management API
# ──────────────────────────────────────────────────────────────────
#
# Usage:
#   ./scripts/supabase-run-sql.sh <sql-file> [project-ref]
#   ./scripts/supabase-run-sql.sh supabase/migrations/20260224_analytics_rpcs.sql
#   ./scripts/supabase-run-sql.sh my-query.sql gcqhxprqshvxsvopxlkf  # dev
#
# Defaults to PRODUCTION (aljcmodwjqlznzcydyor) if no project-ref given.
#
# Requirements:
#   - macOS (uses `security` keychain)
#   - `npx supabase login` must have been run once
#   - `jq` must be installed (brew install jq)
#
# Why this exists:
#   `npx supabase db push` fails on this repo because the migration
#   history diverged years ago (200+ old files). This script bypasses
#   the migration system entirely and runs SQL directly via the
#   Supabase Management API.
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

SQL_FILE="${1:?Usage: $0 <sql-file> [project-ref]}"
PROJECT_REF="${2:-aljcmodwjqlznzcydyor}"  # default: production

if [ ! -f "$SQL_FILE" ]; then
  echo "ERROR: File not found: $SQL_FILE" >&2
  exit 1
fi

# Extract access token from macOS keychain (stored by `npx supabase login`)
ENCODED=$(security find-generic-password -s "Supabase CLI" -a "supabase" -w 2>/dev/null) || {
  echo "ERROR: Supabase access token not found in keychain." >&2
  echo "Run: npx supabase login" >&2
  exit 1
}
SUPABASE_TOKEN=$(echo "$ENCODED" | sed 's/go-keyring-base64://' | base64 -d)

if [ -z "$SUPABASE_TOKEN" ]; then
  echo "ERROR: Failed to decode Supabase access token." >&2
  exit 1
fi

SQL=$(cat "$SQL_FILE")
echo "Running $(wc -l < "$SQL_FILE" | tr -d ' ') lines of SQL against project $PROJECT_REF..."

PAYLOAD=$(jq -n --arg q "$SQL" '{query: $q}')

# Retry on 5xx (Management API control-plane stall — FP-012, observed
# multiple times since 2026-05-22). Supabase status page often stays
# green during these. Two retries at 30s/90s mask the typical 5-10 min
# stall window. 4xx fails fast — those reflect a real SQL/auth bug.
ATTEMPT=0
MAX_ATTEMPTS=3
DELAYS=(30 90)
HTTP_CODE=""
BODY=""

while [ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]; do
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
    -H "Authorization: Bearer $SUPABASE_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  # Success or client error — stop retrying.
  if [ "$HTTP_CODE" -lt 500 ]; then
    break
  fi

  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]; then
    DELAY=${DELAYS[$((ATTEMPT - 1))]}
    echo "Management API returned HTTP $HTTP_CODE — retrying in ${DELAY}s (attempt $((ATTEMPT + 1))/$MAX_ATTEMPTS)..." >&2
    sleep "$DELAY"
  fi
done

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "SUCCESS (HTTP $HTTP_CODE)"
  # Show result if it's not empty array
  if [ "$BODY" != "[]" ] && [ -n "$BODY" ]; then
    echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  fi
else
  echo "FAILED (HTTP $HTTP_CODE)" >&2
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY" >&2
  if [ "$HTTP_CODE" -ge 500 ]; then
    echo "" >&2
    echo "Management API stalled (FP-012). Try the Supabase Studio SQL editor — different code path, works during these stalls:" >&2
    echo "  https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new" >&2
  fi
  exit 1
fi
