# Aggregator v2 — Floor First, Loud Failures

**Date:** 2026-07-09
**Status:** Approved by Yan (design review in session)
**Supersedes:** the original three-leg aggregator (Apify Facebook / Inngest TicketGo / Vercel dalat-gov cron)

## 1. Problem

The event aggregator died silently ~Feb 19 2026 and nobody noticed for five months. Three independent causes, one shared bug shape:

| Leg | Cause of death | Why it was silent |
|-----|---------------|-------------------|
| Facebook via Apify (23 events lifetime, last Feb 19) | Apify account/token invalid | Webhook simply never fired again |
| dalat-gov via Vercel cron (0 events lifetime) | Pinned `claude-3-5-haiku-20241022` hit end-of-life Feb 19 2026 | `catch → console.error → return []` — API death reads as "no events in article" |
| TicketGo via Inngest (0 events lifetime) | Discovery URLs (`ticketgo.vn/khu-vuc/da-lat`) 404 — site restructured | Function returns `success: true` when discovery finds nothing |

Result: 6 published events in the next 14 days; homepage looks dead.

**The shared bug shape: "empty" and "broken" are indistinguishable.** Every fix below either removes a fragile dependency or makes its failure loud within 24h.

## 2. Goals / Non-goals

**Goals**
- Homepage never looks dead again, even when scraping fails (the floor).
- Every import source reports positive evidence of health to a surface Yan reads; source death = alert within 24–48h.
- Restore Facebook (highest-value source) and dalat-gov ingestion.
- Kill zombie code paths so only one scheduler exists per source.

**Non-goals (explicitly shelved)**
- Mac Mini / Playwright browser-farm scraping (Yan chose Apify to avoid FB account bans; Mini option stays on the shelf if Apify burns us).
- TicketGo, Instagram, Zalo, Google Maps as sources.
- Venue self-submission bot (future distribution idea, not this project).

## 3. Layer 0 — Recurring-events floor

Đà Lạt's calendar is structurally recurring (night market, weekly live music, quiz nights, weekend markets). The repo already has `lib/recurrence` (rrule + generation), an `EventSeries` type, and per-series ICS routes.

- Curate ~20–30 recurring series (draft list generated from venues/moments data; Yan approves the list — this is the one taste-gated step).
- Materialize occurrences via the existing recurrence engine so upcoming events always exist.
- Translate each **series** once, not each occurrence — bounds translation cost.
- This decouples "site looks alive" from "scraper worked today." It is the highest-leverage piece of the design and depends on nobody external.

## 4. Layer 1 — Facebook via Apify (restored)

- **Plan decision: stay on Apify Free.** Actor `pratikdani/facebook-event-scraper` is pay-per-result ≈ $15/1,000 events (≈1.5¢/event). Free plan includes $5/month prepaid ≈ 330 events; expected volume ≤150/month. Upgrade to Starter only if the meter says so — running low on credits must surface as an alert, not a silent stop.
- Yan mints a fresh API token (console → Settings → API tokens) → stored via golden-vault flow → set in Vercel env + `.env.local`.
- Re-enable via existing `POST /api/import/schedule {enabled:true}` (creates task `dalat-venue-events-daily`, daily schedule, and `ACTOR.RUN.SUCCEEDED` webhook → `/api/import/apify-webhook`).
- Expand `startUrls` from 1 venue to ~10 highest-signal Đà Lạt venue FB pages (drafted from venues table, Yan can veto).
- Canonicalize FB event URLs (`https://www.facebook.com/events/<numeric-id>`, strip query params incl. `?event_time_id=`) before dedupe **and** insert; `checkDuplicateByUrl` is exact-match so URL variants currently create duplicates.

## 5. Layer 2 — dalat-gov leg (resurrected)

- Model ID moves to env var (`EXTRACTION_MODEL`), defaulting to the **current Haiku alias** — no more pinned corpses. A `model_not_found`/4xx API error is an ERROR in the run report, never `[]`. (Same fix applied to `tiktok.ts` / `instagram.ts`, which reference a non-existent `claude-haiku-4-20250514`.)
- Un-swallow extraction errors: extractor failures count as source errors in the run summary.
- **Date parsing fix:** `parseEventDate` feeds raw strings to `new Date()` — `25/07/2026` parses as MM/DD (wrong month, published, no error). Parse with explicit `dd/MM/yyyy` + `Asia/Ho_Chi_Minh`. Alert when >30% of a run's events fail date parsing.
- Stays on the existing Vercel cron (`0 1 * * *`) — it is already deployed, auth-gated, and its fetch/parse layer verified working.

## 6. Layer 3 — Health that can't die silently

- **`import_runs` table** (new migration — Tier A, confirm before applying): one row per source run — `source, started_at, finished_at, raw_seen, imported, skipped, errors, error_detail`. Written by the webhook handler, the gov cron, and any manual import.
- **Telegram sender** (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` env): tiny helper, used for (a) per-run one-liners — `FB 12 raw · 8 new drafts · gov 3 · errors 0`, (b) alerts.
- **Error-vs-empty contract:** a source reporting `0 raw` twice in a row is an ERROR, not a quiet day. Apify credit exhaustion, login/auth failures, and model errors are ERRORS.
- **Customer-promise watchdog** (daily, piggybacks on an existing Vercel cron): `published events with starts_at in next 14 days < 8 → alert`. Monitors what visitors see, not the plumbing. Runs on Vercel — a different machine from nothing (all scrapers are cloud-side now), but critically a different code path from the importers.

## 7. Safety gates on imports

- **Draft gate (month one):** scraped events land as `status: "draft"`; Telegram digest links to the admin review surface. After a month of clean scrapes, flip to auto-publish. Rationale: homepage ISR revalidates in ~5 min and each published event fires 12-language translation + `AFTER INSERT` triggers (auto-RSVP for series subscribers) — a bad scrape morning must not go straight to prod.
- **Per-run cap:** max 15 new events per source per run, forever. First run after 5 dead months could otherwise dump 50–100 events (~$25 translation) at once.
- **⛔ Storage-path fix (must land before any run):** `downloadAndUploadImage` (`lib/import/utils.ts:211`) still uploads via `supabase.storage.from("event-media")` — the banned path from the Feb 432-image incident. Swap body to `getStorageProvider("event-media")` from `lib/storage`. Note FB CDN image URLs expire, so download-and-rehost at import time is mandatory, not optional.

## 8. Cleanup (same commit as the model fix)

- Delete TicketGo: `lib/import/processors/ticketgo.ts`, `dailyEventDiscovery` + `manualEventDiscovery` in `lib/inngest/functions/event-discovery.ts`, their exports and `serve()` registrations. Zero lifetime events; URLs rotted. One scheduler per source, no zombies.
- Sequencing matters: fixing the extraction model auto-revives the existing `sync-dalat-gov` Vercel cron on deploy — the cleanup and safety gates must be in the same deploy so nothing double-runs or floods.

## 9. Rollout & verification

1. Code: storage fix, date fix, model env var, draft gate + cap, URL canonicalization, TicketGo deletion, `import_runs` writes, Telegram helper, watchdog. Deploy.
2. Migration: `import_runs` (Tier A — Yan confirms) → verify in `schema_migrations`.
3. Yan: mint Apify token (only human step) → vault → Vercel env → re-enable schedule → supervised test run.
4. Seed the recurring-series floor (Yan approves curated list) → homepage shows a month-deep calendar on day one.
5. Acceptance tests ("alive forever" is falsifiable, not vibes):
   - Set `EXTRACTION_MODEL` to a fake ID → Telegram ERROR within one run.
   - Invalidate the Apify token → ERROR (not silence) within 24h.
   - A normally-productive source reports 0 raw twice → ERROR.
   - Homepage 14-day count dips below 8 → alert.

## 10. Dependencies & open items

- **Yan:** Apify token (only blocker for Layer 1); approve series list (Layer 0); Telegram bot token/chat id if one doesn't already exist (2-min BotFather setup, one-time).
- **Accepted dependency:** Apify remains third-party. The trade: its next death is a 24h alert + a homepage that stays alive via the floor, instead of a five-month silence. Anthropic API stays for prose extraction (own vendor account, model un-pinned, errors loud).
