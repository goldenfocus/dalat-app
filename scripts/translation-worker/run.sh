#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
exec node node_modules/tsx/dist/cli.mjs scripts/translation-worker/worker.ts --loop
