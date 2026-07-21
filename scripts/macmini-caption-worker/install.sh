#!/bin/bash
#
# dalat.app caption worker — idempotent macOS (Apple Silicon) setup.
# Requires the `claude` CLI already installed + authenticated (subscription).
# Writes worker.env and loads the launchd job. Safe to re-run.
#
set -euo pipefail

WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_NAME="com.goldenfocus.dalat-caption-worker"
PLIST_SRC="$WORKER_DIR/$PLIST_NAME.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
ENV_FILE="$WORKER_DIR/worker.env"

echo "==> dalat.app caption worker installer"

# --- Node ---------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found. Install it first: brew install node" >&2
  exit 1
fi
NODE_BIN="$(command -v node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node >= 20 required (found $(node -v))" >&2
  exit 1
fi
echo "  node: $NODE_BIN ($(node -v))"

# --- claude CLI ---------------------------------------------------------
CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
if [ ! -x "$CLAUDE_BIN" ] && ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: claude CLI not found at $CLAUDE_BIN. Install + authenticate it first." >&2
  exit 1
fi
echo "  claude: ${CLAUDE_BIN}"

# --- worker.env ---------------------------------------------------------
if [ -f "$ENV_FILE" ] && grep -q '^ADMIN_API_KEY=..*' "$ENV_FILE"; then
  echo "  worker.env: already configured (delete it to reconfigure)"
else
  printf "Enter ADMIN_API_KEY for dalat.app: "
  read -rs ADMIN_API_KEY
  echo
  if [ -z "$ADMIN_API_KEY" ]; then
    echo "ERROR: ADMIN_API_KEY cannot be empty" >&2
    exit 1
  fi
  cat > "$ENV_FILE" <<EOF
DALAT_BASE_URL=https://dalat.app
ADMIN_API_KEY=$ADMIN_API_KEY
POLL_SECONDS=60
BATCH_SIZE=10
CLAUDE_MODEL=claude-haiku-4-5-20251001
# Uncomment after \`ollama pull qwen2.5vl:7b\` to enable the local fallback:
# OLLAMA_FALLBACK_MODEL=qwen2.5vl:7b
EOF
  chmod 600 "$ENV_FILE"
  echo "  worker.env: written (chmod 600)"
fi

# --- launchd ------------------------------------------------------------
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
sed -e "s|__WORKER_DIR__|$WORKER_DIR|g" \
    -e "s|__NODE_BIN__|$NODE_BIN|g" \
    -e "s|__HOME__|$HOME|g" \
    "$PLIST_SRC" > "$PLIST_DEST"

# Reload if already running, otherwise load fresh
launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DEST"

echo "==> Done. Worker is running under launchd."
echo "    Logs: tail -f ~/Library/Logs/dalat-caption-worker.log"
