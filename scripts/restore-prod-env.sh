#!/bin/bash
# Restore Production env vars on Vercel (vibeyangs-projects/dalat-app).
#
# Context: the project lost ALL Production-scoped env vars during a team
# transfer (only Preview/Development survived). This script copies every
# Preview var to Production scope. It contains no secrets — values are read
# from Vercel Preview at runtime.
#
# Requires: a Vercel login with admin/owner role on vibeyangs-projects
# (the "zangveg" member role gets: "Additional permissions are required to
# create production environment variables"). Run `vercel login` as vibeyang
# or promote zangveg, then:  ./scripts/restore-prod-env.sh
set -euo pipefail

cd "$(dirname "$0")/.."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Pulling Preview env..."
vercel env pull "$TMP/.env.preview" --environment=preview --yes >/dev/null

# Vercel system vars and CI junk that must not be copied
SKIP="VERCEL|VERCEL_ENV|VERCEL_OIDC_TOKEN|VERCEL_URL|VERCEL_TARGET_ENV|VERCEL_GIT|TURBO_|NX_DAEMON|NODE_ENV"

echo "Copying to Production..."
while IFS='=' read -r name value; do
  case "$name" in \#*|'') continue ;; esac
  if echo "$name" | grep -qE "^($SKIP)"; then continue; fi
  clean=$(printf '%s' "$value" | sed 's/^"//; s/"$//')
  if printf '%s' "$clean" | vercel env add "$name" production --force >/dev/null 2>&1; then
    echo "  ✓ $name"
  else
    echo "  ✗ $name FAILED"
  fi
done < "$TMP/.env.preview"

echo
echo "Done. Verify with: vercel env ls production"
echo "Then deploy: vercel --prod"
