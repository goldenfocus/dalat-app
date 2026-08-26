# Import Worker — Mac mini Setup

Drains `import_queue` nightly: extracts events from scraped articles and
translates them into the 12 locales through the already-paid Codex, Grok, and
Kimi CLI sessions. Zero marginal cost — no metered model API keys are used.
Design: `docs/superpowers/specs/2026-07-09-zero-cost-scraping-design.md`

## One-time setup on the mini

```bash
# 1. Code + deps
git clone https://github.com/goldenfocus/dalat-app.git ~/dalat-app
cd ~/dalat-app && npm install

# 2. Subscription CLIs, logged in interactively once
codex login                 # choose Sign in with ChatGPT
grok login                  # grok.com subscription
kimi login                  # Kimi Code subscription

# 3. Secrets — the worker reads .env.local (or WORKER_ENV_FILE).
#    Needs: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#           TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
#           R2_* keys (event cover image uploads).
#    Optional: IMPORT_CREATED_BY (profile UUID owning imported events;
#              defaults to the 'yan' profile).
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

- Every model CLI runs **tool-less with a stripped env** — scraped text can't
  reach credentials (prompt-injection containment; don't weaken). Grok uses an
  empty tool allowlist, Kimi uses `tool-less-agent.md`, and Codex runs inside a
  macOS `sandbox-exec` profile that denies child processes, on top of Codex's
  read-only sandbox.
- Extraction prefers Grok → Kimi → Codex. Translation prefers Kimi → Grok →
  Codex. An unavailable provider is circuit-broken for the remainder of the
  run, so expired auth cannot stall every batch.
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
| Extraction order | `WORKER_EXTRACT_PROVIDERS=grok,kimi,codex npm run import:worker` |
| Translation order | `WORKER_TRANSLATE_PROVIDERS=kimi,grok,codex npm run import:worker` |
| Model overrides | `WORKER_CODEX_MODEL=...`, `WORKER_GROK_MODEL=...`, `WORKER_KIMI_MODEL=...` |
| Provider timeout | `WORKER_PROVIDER_TIMEOUT_MS=180000` (default) |
| Different env file | `WORKER_ENV_FILE=/path/.env npm run import:worker` |

Gotchas: keep at least one configured CLI logged in (auth failures fall through
to the next provider and surface in the worker logs); Codex is intentionally
disabled on non-macOS hosts because its extra tool-containment layer depends on
`sandbox-exec`; `.env.local` values sometimes carry a literal trailing `\n` —
the worker strips it, but other scripts may not.
