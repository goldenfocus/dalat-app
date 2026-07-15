#!/bin/bash
#
# dalat.app cover worker — idempotent macOS (Apple Silicon) setup.
# Installs uv + mflux, writes worker.env, and loads the launchd job.
# Safe to re-run: skips anything already installed/configured.
#
set -euo pipefail

WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_NAME="com.goldenfocus.dalat-cover-worker"
PLIST_SRC="$WORKER_DIR/$PLIST_NAME.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
ENV_FILE="$WORKER_DIR/worker.env"

echo "==> dalat.app cover worker installer"

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

# --- uv -----------------------------------------------------------------
if ! command -v uv >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "==> Installing uv via Homebrew..."
    brew install uv
  elif command -v pipx >/dev/null 2>&1; then
    echo "==> Installing uv via pipx..."
    pipx install uv
  else
    echo "ERROR: neither brew nor pipx found — install Homebrew first: https://brew.sh" >&2
    exit 1
  fi
else
  echo "  uv: already installed ($(command -v uv))"
fi

# --- mflux --------------------------------------------------------------
if ! command -v mflux-generate >/dev/null 2>&1; then
  echo "==> Installing mflux (uv tool install mflux)..."
  uv tool install mflux
else
  echo "  mflux-generate: already installed ($(command -v mflux-generate))"
fi

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
POLL_MINUTES=10
MODEL=schnell
STEPS=3
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
echo "    Logs: tail -f ~/Library/Logs/dalat-cover-worker.log"
