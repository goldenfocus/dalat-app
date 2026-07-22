# Mac mini translation worker

Runs `scripts/backfill-translations-ai.ts` 24/7 under launchd with the
claude-first translator (subscription Haiku via `claude -p`, zero
pay-per-token keys), falling back to the free provider chain (local qwen3 →
CF Llama → OpenRouter) when claude is quota-limited or offline.

**Why launchd, not ssh/nohup:** `claude -p` credentials live in the login
keychain, which only unlocks in the GUI session. The same constraint as the
caption worker.

## Deploy / update (from a laptop)

```bash
ssh theoutsider@100.66.94.41 '/bin/bash -c "
  cd ~/dalat-app && git pull &&
  # kill any ssh-spawned backfill BEFORE pinning REDO_BEFORE
  pkill -f backfill-translations-ai || true
  sed \"s/REPLACE_AT_DEPLOY/$(date -u +%Y-%m-%dT%H:%M:%SZ)/\" \
    scripts/macmini-translate-worker/com.goldenfocus.dalat-translate-worker.plist \
    > ~/Library/LaunchAgents/com.goldenfocus.dalat-translate-worker.plist
  launchctl bootout gui/\$(id -u)/com.goldenfocus.dalat-translate-worker 2>/dev/null
  launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/com.goldenfocus.dalat-translate-worker.plist
"'
```

`REDO_BEFORE` must stay pinned across restarts — only re-run the `sed` when
intentionally widening the redo window (e.g. after a period where the
2-hourly cron fallback wrote qwen3 rows while this worker was down).

## Watch

```bash
ssh theoutsider@100.66.94.41 'tail -f ~/Library/Logs/dalat-translate-worker.log'
```

Log lines show the engine per unit: `(claude, Ns)`, `(fallback-chain, Ns)`,
`(copy-through)`. If everything says fallback-chain, claude is unavailable —
check login/quota on the mini (must be from the GUI session, not ssh).
