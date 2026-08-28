# Mac mini translation worker

Runs `scripts/backfill-translations-ai.ts` 24/7 under launchd with the
configured provider chain. Set `CLAUDE_ENABLED=0` to disable the optional
Claude CLI path and `LOCAL_AI_ENABLED=0` to skip an unavailable local model;
the worker then goes directly to Cloudflare Workers AI, with OpenRouter as
the final fallback.

The production launchd job currently disables both optional paths. This
avoids authentication/backoff delays and keeps provider choice explicit.

## Deploy / update (from a laptop)

Routine updates move only the clean checkout and restart the existing job. The
installed plist—and therefore its pinned `REDO_BEFORE` value—stays untouched.

```bash
ssh theoutsider@100.66.94.41 '/bin/bash -c "
  set -euo pipefail
  cd ~/dalat-app-seo-worker && git fetch origin main && git checkout --detach origin/main &&
  /usr/bin/env PATH=/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/bin:/bin \
    /opt/homebrew/bin/npx -y npm@11.12.1 --prefix ~/dalat-app-seo-worker ci &&
  launchctl kickstart -k gui/\$(id -u)/com.goldenfocus.dalat-translate-worker
"'
```

`REDO_BEFORE` must stay pinned across restarts — only change it when
intentionally widening the redo window (for example, after a period where the
2-hourly cron fallback wrote qwen3 rows while this worker was down).

For a first install or an intentional repin, boot out the job before copying
the template, set an explicit reviewed timestamp in the installed plist, then
bootstrap it. Never replace the pin with the current time during a routine
update. When `CLAUDE_ENABLED=0`, the stored pin is preserved but the
Claude-only redo scan is disabled.

## Watch

```bash
ssh theoutsider@100.66.94.41 'tail -f ~/Library/Logs/dalat-translate-worker.log'
```

Log lines show the engine per unit: `(claude, Ns)`, `(fallback-chain, Ns)`,
`(copy-through)`. With the optional Claude path disabled, `fallback-chain`
is expected; the adjacent provider log identifies Cloudflare or OpenRouter.
