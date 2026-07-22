#!/bin/bash
# dalat.app translation worker launcher — runs on the Mac mini UNDER LAUNCHD.
#
# launchd (GUI session) is load-bearing: `claude -p` reads keychain-held
# credentials that a plain SSH shell cannot unlock. Do not run this via
# ssh/nohup and expect claude to work — it will silently fall back to qwen3.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/dalat-app}"
cd "$APP_DIR"

# Export .env.local, stripping the literal trailing \n some values carry
while IFS= read -r line; do
  case "$line" in \#*|"") continue ;; esac
  key="${line%%=*}"
  val="${line#*=}"
  val="${val%\\n}"
  export "$key=$val"
done < <(cat .env.local; echo) # trailing echo: read a final line lacking \n

export CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
if [ ! -x "$CLAUDE_BIN" ]; then
  echo "FATAL: claude CLI not executable at $CLAUDE_BIN" >&2
  exit 1
fi
export CLAUDE_MODEL="${CLAUDE_MODEL:-claude-haiku-4-5-20251001}"
export LOCAL_AI_URL="${LOCAL_AI_URL:-http://127.0.0.1:11501}"
if [ -z "${LOCAL_AI_TOKEN:-}" ] && [ -f "$HOME/dalat-ai-proxy/secret.txt" ]; then
  LOCAL_AI_TOKEN="$(cat "$HOME/dalat-ai-proxy/secret.txt")"
  export LOCAL_AI_TOKEN
fi

# Scan deep enough to cover ALL content, not just the newest 200 per type
export SCAN_LIMIT="${SCAN_LIMIT:-5000}"
export RUN_FOREVER=1
# Redo window: the qwen3/Llama era. REDO_BEFORE is pinned in the plist at
# deploy time (the moment the last qwen3 writer was killed) — never a
# moving value, or the worker would chase its own upserts.
export REDO_SINCE="${REDO_SINCE:-2026-07-09T00:00:00Z}"
case "${REDO_BEFORE:-}" in
  "" | REPLACE_AT_DEPLOY)
    echo "FATAL: REDO_BEFORE not pinned (got '${REDO_BEFORE:-}') — run the deploy sed from the README" >&2
    exit 1
    ;;
esac

export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"
exec npx tsx --tsconfig tsconfig.json scripts/backfill-translations-ai.ts
