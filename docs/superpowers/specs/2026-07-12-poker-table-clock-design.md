# Poker Table Clock — Design (2026-07-12)

Shipped same-day for the "Poker DaLat Free Tournament" event (3pm ICT). Scope chosen by Yan: **clock + voice only** — no DB, no migration, no realtime.

## What it is

`/events/[slug]/table` — a fullscreen, no-login tournament blind clock meant to sit propped on a phone/tablet at the poker table all night.

- **Blind clock**: default turbo structure (25/50 doubling ladder, antes from level 5), 10-minute levels. Presets: Hyper 6 min / Turbo 10 min / Standard 15 min. Every level fully editable (SB/BB/ante/minutes, add/remove).
- **Audio**: Web Audio synthesized chime (no assets) + `speechSynthesis` voice announcements — "Shuffle up and deal!" on start, "Blinds up! Now {sb}, {bb}" on each level, one-minute warning. All voice lines translated (12 locales) and spoken in the page locale.
- **Reliability**: absolute `endsAt` timestamp (drift-proof across background tabs), Wake Lock API with re-acquire on visibility change, localStorage persistence per event slug (refresh-safe).
- **Controls**: tap-to-start (doubles as iOS audio unlock), pause/resume, prev/next level, +1 min, mute, reset.
- **Branding**: dalat.app wordmark on the screen everyone stares at for 4 hours.

## Architecture

- `app/[locale]/events/[slug]/table/page.tsx` — server component, fetches event (published check), noindex metadata.
- `components/events/table-clock.tsx` — single "use client" component; all timer/audio/state logic. No API routes, no DB writes.
- `pokerTable` namespace added to all 12 `messages/*.json` + `lib/i18n/client-namespaces.ts`.

## Rejected for tonight (red team)

- DB-backed point system → migration = Tier A Sacred Stop, zero margin pre-event. Future: standings → season leaderboard (possibly via loyalty system).
- Supabase Realtime multi-device sync → added failure modes; one screen per table is how real tournaments run.
- Custom TTS voices → speechSynthesis is instant and free.
