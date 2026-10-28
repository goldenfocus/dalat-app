#!/bin/bash
# Install the existing, authenticated subscription worker in this clean checkout.
set -euo pipefail
worker_root="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
test -f "$worker_root/.env.local" || { echo 'Missing .env.local in worker checkout.' >&2; exit 1; }
command -v claude >/dev/null
command -v codex >/dev/null
env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL claude auth status | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("loggedIn") else 1)' || { echo 'Sign in to Claude CLI on this Mac before installation.' >&2; exit 1; }
codex login status >/dev/null 2>&1 || { echo 'Sign in to Codex CLI on this Mac before installation.' >&2; exit 1; }
export DALAT_TRANSLATION_CHECKOUT="$worker_root"
python3 - <<'PY'
import os,plistlib,datetime
root=os.environ['DALAT_TRANSLATION_CHECKOUT']
state=os.path.expanduser('~/.local/state/dalat-translation')
path=os.path.expanduser('~/Library/LaunchAgents/com.goldenfocus.dalat-subscription-translation.plist')
os.makedirs(state,mode=0o700,exist_ok=True)
os.makedirs(os.path.dirname(path),exist_ok=True)
old=plistlib.load(open(path,'rb')) if os.path.exists(path) else {}
pin=old.get('EnvironmentVariables',{}).get('TRANSLATION_REVIEW_AFTER',datetime.datetime.now(datetime.timezone.utc).isoformat())
job={'Label':'com.goldenfocus.dalat-subscription-translation','ProgramArguments':['/bin/bash',root+'/scripts/translation-worker/run.sh'],'WorkingDirectory':root,'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':60,'StandardOutPath':state+'/worker.log','StandardErrorPath':state+'/worker.log','EnvironmentVariables':{'TRANSLATION_STATE_DIR':state,'TRANSLATION_REVIEW_AFTER':pin,'TRANSLATION_ITEMS_PER_TYPE':'8'}}
with open(path,'wb') as f:plistlib.dump(job,f)
PY
worker_label="gui/$(id -u)/com.goldenfocus.dalat-subscription-translation"
launchctl bootout "$worker_label" 2>/dev/null || true
# launchd may still be reaping the previous process immediately after bootout.
translation_bootstrap_error="$(mktemp)"
trap 'rm -f "$translation_bootstrap_error"' EXIT
translation_bootstrapped=0
for translation_attempt in 1 2 3 4 5; do
  if launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.goldenfocus.dalat-subscription-translation.plist" 2>"$translation_bootstrap_error"; then
    translation_bootstrapped=1
    break
  fi
  sleep 1
done
if [ "$translation_bootstrapped" -ne 1 ]; then
  cat "$translation_bootstrap_error" >&2
  exit 1
fi
echo 'Installed worker. Verify heartbeat and a reviewed write before stopping any previous worker.'
