#!/bin/bash
# Install the recap render worker as a launchd agent on this Mac.
# Usage: RECAP_WORKER_ID=zang scripts/recap-worker/install.sh
set -euo pipefail
worker_root="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
test -f "$worker_root/.env.local" || { echo 'Missing .env.local in worker checkout.' >&2; exit 1; }
command -v node >/dev/null
export DALAT_RECAP_CHECKOUT="$worker_root"
python3 - <<'PY'
import os,plistlib
root=os.environ['DALAT_RECAP_CHECKOUT']
state=os.path.expanduser('~/.local/state/dalat-recap')
path=os.path.expanduser('~/Library/LaunchAgents/com.goldenfocus.dalat-recap-worker.plist')
os.makedirs(state,mode=0o700,exist_ok=True)
os.makedirs(os.path.dirname(path),exist_ok=True)
env={}
if os.environ.get('RECAP_WORKER_ID'): env['RECAP_WORKER_ID']=os.environ['RECAP_WORKER_ID']
job={'Label':'com.goldenfocus.dalat-recap-worker','ProgramArguments':['/bin/bash',root+'/scripts/recap-worker/run.sh'],'WorkingDirectory':root,'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':60,'StandardOutPath':state+'/worker.log','StandardErrorPath':state+'/worker.log','EnvironmentVariables':env}
with open(path,'wb') as f:plistlib.dump(job,f)
PY
label="gui/$(id -u)/com.goldenfocus.dalat-recap-worker"
launchctl bootout "$label" 2>/dev/null || true
for attempt in 1 2 3 4 5; do
  if launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.goldenfocus.dalat-recap-worker.plist" 2>/dev/null; then
    echo 'Installed recap worker. Tail ~/.local/state/dalat-recap/worker.log.'
    exit 0
  fi
  sleep 1
done
echo 'launchctl bootstrap failed.' >&2
exit 1
