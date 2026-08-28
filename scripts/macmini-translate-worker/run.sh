#!/bin/bash
# dalat.app translation worker launcher — runs on the Mac mini under launchd.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/dalat-app}"
worker_claude_enabled="${CLAUDE_ENABLED:-1}"
worker_local_ai_enabled="${LOCAL_AI_ENABLED:-1}"
cd "$APP_DIR"

# Export .env.local (Vercel CLI format: values are double-quoted and some
# carry a literal trailing \n inside the quotes — strip both)
while IFS= read -r line; do
  case "$line" in \#*|"") continue ;; esac
  key="${line%%=*}"
  val="${line#*=}"
  val="${val#\"}"
  val="${val%\"}"
  val="${val%\\n}"
  export "$key=$val"
done < <(cat .env.local; echo) # trailing echo: read a final line lacking \n

if [ "$worker_claude_enabled" = "1" ]; then
  export CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
  if [ ! -x "$CLAUDE_BIN" ]; then
    echo "FATAL: claude CLI not executable at $CLAUDE_BIN" >&2
    exit 1
  fi
  export CLAUDE_MODEL="${CLAUDE_MODEL:-claude-haiku-4-5-20251001}"
else
  unset CLAUDE_BIN CLAUDE_MODEL
fi

if [ "$worker_local_ai_enabled" = "1" ]; then
  export LOCAL_AI_URL="${LOCAL_AI_URL:-http://127.0.0.1:11501}"
  if [ -z "${LOCAL_AI_TOKEN:-}" ] && [ -f "$HOME/dalat-ai-proxy/secret.txt" ]; then
    LOCAL_AI_TOKEN="$(cat "$HOME/dalat-ai-proxy/secret.txt")"
    export LOCAL_AI_TOKEN
  fi
else
  unset LOCAL_AI_URL LOCAL_AI_TOKEN
fi
echo "[translate-worker] claude_enabled=$worker_claude_enabled local_ai_enabled=$worker_local_ai_enabled"

# Scan deep enough to cover ALL content, not just the newest 200 per type
export SCAN_LIMIT="${SCAN_LIMIT:-5000}"
export RUN_FOREVER=1
# The historical quality-redo path is Claude-only. Keep its boundary stored in
# the plist, but do not scan an undrainable redo queue when Claude is disabled.
if [ "$worker_claude_enabled" = "1" ]; then
  export REDO_SINCE="${REDO_SINCE:-2026-07-09T00:00:00Z}"
  case "${REDO_BEFORE:-}" in
    "" | REPLACE_AT_DEPLOY)
      echo "FATAL: REDO_BEFORE is not pinned (got '${REDO_BEFORE:-}')" >&2
      exit 1
      ;;
  esac
else
  unset REDO_SINCE REDO_BEFORE
fi

export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"
exec npx tsx --tsconfig tsconfig.json scripts/backfill-translations-ai.ts
