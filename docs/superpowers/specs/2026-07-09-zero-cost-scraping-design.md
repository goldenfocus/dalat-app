# Zero-Cost Event Scraping — Design

**Date:** 2026-07-09 · **Status:** Approved by Yan ("go")

## Problem

Event scraping is dead: the Anthropic API account ran out of credits, so the
nightly `sync-dalat-gov` cron scrapes 30 articles and fails all 30 extractions.
No scraped event has landed since 2026-02-19. Goal: rebuild the pipeline at
**zero marginal cost**.

## Decisions (from brainstorm)

1. **AI = Yan's Claude subscription**, not the metered API. An always-on Mac
   mini runs headless `claude -p` for extraction *and* 12-locale translation.
2. **Architecture = queue split.** Vercel keeps scraping (it works); a Supabase
   `import_queue` decouples fetch from extract; the mini drains the queue.
3. **Facebook = phase 2.** Both review passes flagged Apify's free tier as the
   weak point ($5 credit ≈ days of per-result billing; out-of-credit actors
   return 0 results *successfully* — v1's death mode). Decide with real data.
4. **Community submissions = phase 2**, but the queue accepts
   `type: url | image | text` from day one so posters are a drop-in.

## Architecture

```
Vercel cron (daily 01:00 UTC) ──scrape gov.vn──> import_queue (Supabase)
Community submits (phase 2) ────────────────────> import_queue
                                                      │
Mac mini (launchd, nightly) <────pull pending─────────┘
  ├─ claude -p (NO tools, no creds in env): extract + translate ×12
  ├─ Zod validate — fail → status=failed + alert (garbage never inserts)
  └─ writer (service key): idempotent upserts → events + content_translations
       └─ heartbeat → import_runs (source: macmini-extract) + Telegram digest
Health-check cron (02:30 UTC): backlog age · canary hatched · heartbeats · floor
```

## Red-team hardening (baked in, non-negotiable)

- **Brain/hands split:** `claude -p` reads untrusted scraped text with all
  tools disabled and a stripped environment (no Supabase/R2/Telegram keys).
  A deterministic writer holds the keys and only writes Zod-validated data.
- **Schema contract:** ISO dates, explicit Asia/Ho_Chi_Minh handling, all 12
  locales required. Validation failure throws + alerts; never inserts.
- **Queue discipline:** atomic claims, `attempts >= 3 → failed` (no poison
  loops), `UNIQUE (source, source_uid)` + upserts (no duplicate events).
- **Loud failure:** worker exits nonzero + Telegrams on any error; health-check
  alerts on backlog age > 48h, missing canary, silent heartbeats, and the
  existing published-events floor.

## Components

| Piece | Where | Change |
|---|---|---|
| `import_queue` table | migration `20261005_001` | new; RLS on, no policies (service-role only) |
| Enqueue | `app/api/cron/sync-dalat-gov/route.ts` | scrape → upsert queue rows + daily canary row; heartbeat stays |
| Import logic | `lib/import/import-events.ts` | extracted from `processGovArticles` (Next-free, shared) |
| Worker | `scripts/import-worker/worker.ts` (tsx) | claim → claude -p extract (chunks of 5) → validate → import → claude -p translate ×12 → upsert translations → heartbeat |
| Scheduling | `scripts/import-worker/com.dalat.import-worker.plist` | launchd nightly on the mini |
| Watchdog | `app/api/cron/health-check/route.ts` | + backlog age, + canary check, + watch `macmini-extract` |

## Canary

The enqueue cron adds one synthetic Vietnamese article per day
(`source: canary`) announcing a fake next-day event. The worker processes it
like any row but always as a **draft** with `source_platform: canary` (never
public). Health-check asserts a canary event was created in the last 26h —
proving fetch→queue→extract→insert end to end — then deletes canary events.

## Costs

$0 marginal. Extraction ≈ 6–8 batched `claude -p` calls + ~1 translation call
per imported event per night, on the existing subscription. The honest cost is
subscription quota; if a night is rate-limited the run fails loudly and the
queue self-heals next night.

## Out of scope (phase 2)

Facebook leg (Apify-capped vs mini-browser) · community poster submissions ·
admin re-queue UI.
