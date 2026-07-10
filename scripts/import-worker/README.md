# Import Worker — Mac mini Setup

Drains `import_queue` nightly: extracts events from scraped articles and
translates them into the 12 locales via headless `claude -p` on the Claude
subscription. Zero marginal cost — no Anthropic API credits involved.
Design: `docs/superpowers/specs/2026-07-09-zero-cost-scraping-design.md`

## One-time setup on the mini

```bash
# 1. Code + deps
git clone https://github.com/goldenfocus/dalat-app.git ~/dalat-app
cd ~/dalat-app && npm install

# 2. Claude Code CLI, logged into the subscription (interactive, once)
npm install -g @anthropic-ai/claude-code
claude   # complete login, then exit

# 3. Secrets — the worker reads .env.local (or WORKER_ENV_FILE).
#    Needs: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#           TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
#           R2_* keys (event cover image uploads).
#    Pull from the vault / vercel env pull — do NOT hand-type keys.

# 4. Smoke test (processes real pending rows into DRAFT events)
npm run import:worker

# 5. Schedule via launchd — fill in the __PLACEHOLDERS__ first:
#    __REPO_PATH__ = absolute repo path; hours/minutes = two local times
#    that land between 01:15 and 02:15 UTC (see plist comment).
sed -e "s|__REPO_PATH__|$HOME/dalat-app|" \
    -e "s|__HOUR1__|20|" -e "s|__MIN1__|30|" \
    -e "s|__HOUR2__|21|" -e "s|__MIN2__|15|" \
    scripts/import-worker/com.dalat.import-worker.plist \
    > ~/Library/LaunchAgents/com.dalat.import-worker.plist
launchctl load ~/Library/LaunchAgents/com.dalat.import-worker.plist

# 6. Verify tomorrow: Telegram digest 📥 + no 🚨 from health-check at
#    02:30 UTC, and drafts at https://dalat.app/admin/import
```

## How it stays safe and loud

- `claude -p` runs **tool-less with a stripped env** — scraped text can't
  reach credentials (prompt-injection containment; don't weaken).
- Output is Zod-validated: bad dates or missing locales → row `failed` +
  Telegram, never a garbage insert.
- Rows fail permanently after 3 attempts (no poison loops); every run writes
  an `import_runs` heartbeat (`macmini-extract`), even idle ones.
- Health-check (Vercel, 02:30 UTC) alerts on: silent worker (48h), queue
  backlog older than 48h, and a missing daily canary event.

## Ops

| Task | Command |
|---|---|
| Run now | `npm run import:worker` |
| Logs | `tail -f /tmp/dalat-import-worker.log /tmp/dalat-import-worker.err` |
| Retry failed rows | set `status='pending', attempts=0` on the row |
| Model override | `WORKER_MODEL=sonnet npm run import:worker` |
| Different env file | `WORKER_ENV_FILE=/path/.env npm run import:worker` |

Gotchas: keep the mini logged into `claude` (token expiry shows up as the
worker crash alert); `.env.local` values sometimes carry a literal trailing
`\n` — the worker strips it, but other scripts may not.
