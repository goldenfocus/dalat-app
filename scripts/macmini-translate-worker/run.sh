#!/bin/bash
# dalat.app translation worker launcher — runs on the Mac mini under launchd.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/dalat-app}"
worker_claude_enabled="${CLAUDE_ENABLED:-1}"
worker_local_ai_enabled="${LOCAL_AI_ENABLED:-1}"
cd "$APP_DIR"

# Secrets stay inside the node process: load-env.mjs (preloaded below) reads
# this file, which must be mode 600. Nothing here exports a token, and node is
# exec'd directly (no npx/npm exec), so no command line or process title can
# carry one.
export WORKER_ENV_FILE="$APP_DIR/.env.local"
chmod 600 "$WORKER_ENV_FILE"
worker_unset=""

if [ "$worker_claude_enabled" = "1" ]; then
  export CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
  if [ ! -x "$CLAUDE_BIN" ]; then
    echo "FATAL: claude CLI not executable at $CLAUDE_BIN" >&2
    exit 1
  fi
  export CLAUDE_MODEL="${CLAUDE_MODEL:-claude-haiku-4-5-20251001}"
else
  unset CLAUDE_BIN CLAUDE_MODEL
  worker_unset="$worker_unset CLAUDE_BIN CLAUDE_MODEL"
fi

if [ "$worker_local_ai_enabled" = "1" ]; then
  export LOCAL_AI_URL="${LOCAL_AI_URL:-http://127.0.0.1:11501}"
  export LOCAL_AI_TOKEN_FILE="$HOME/dalat-ai-proxy/secret.txt"
else
  unset LOCAL_AI_URL LOCAL_AI_TOKEN LOCAL_AI_TOKEN_FILE
  worker_unset="$worker_unset LOCAL_AI_URL LOCAL_AI_TOKEN"
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
  worker_unset="$worker_unset REDO_SINCE REDO_BEFORE"
fi

export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"
export WORKER_UNSET="$worker_unset"
export TSX_TSCONFIG_PATH=tsconfig.json
exec node --import "$APP_DIR/scripts/macmini-translate-worker/load-env.mjs" --import tsx scripts/backfill-translations-ai.ts
