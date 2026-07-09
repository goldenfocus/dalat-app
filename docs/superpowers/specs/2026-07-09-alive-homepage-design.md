# Alive Homepage — Design Spec

**Date:** 2026-07-09 · **Status:** Approved by Yan (both phases)

## Problem

The homepage reads as a generic template site:

1. Every event without an uploaded image renders the same default PNG
   (`components/events/event-default-image.tsx`) — three identical covers in a row above the fold.
2. Events show "0 going" or "1/10". Creator auto-RSVP exists for single events and the *first*
   event of a series (`components/events/event-form.tsx:624,696`) but not for recurring
   occurrences or imported events.
3. Classic cold-start social proof problem: low counts make the app look dead, which keeps counts low.

## Goals (verifiable)

- Zero above-the-fold homepage event cards showing the generic placeholder cover when the
  event's series has photo history.
- Zero cards rendering "0 going" (low counts hidden, replaced by past-proof).
- Both enforced by a CI ratchet test (same pattern as `check-input-zoom`).

## Phase 1 — Real History

### 1.1 Moments-as-cover (write-time resolution)

For upcoming events with no `image_url` but a `series_id`, show the best real photo from the
most recent **past** occurrence of the same series.

- **Schema:** add `events.fallback_image_url text` and `events.fallback_moment_id uuid`
  (references `moments`, `ON DELETE SET NULL` semantics via trigger that also nulls the URL).
- **Resolution logic** (SQL function): most recent past occurrence in the series →
  prefer its `cover_moment_id` (existing organizer-curated pick, `20260609` migration) →
  else highest `quality_score` **published image** moment. Store the moment's media URL + id
  on the upcoming event row.
- **When it runs:** nightly cron (`/api/cron/refresh-fallback-covers`) + one-time backfill now.
  **Write-time only — the homepage feed RPCs are NOT modified for this.** (The
  `get_homepage_moments_strip` family has broken three times; we don't touch its ORDER BY.)
- **Deletion hygiene:** trigger on moment delete/unpublish clears any `fallback_moment_id`
  pointing at it (and the URL).
- **Card render order:** `image_url` → `fallback_image_url` → default PNG.
- **Photographer credit loop:** card shows a small "📸 @username" chip (moment owner);
  owner gets a one-time notification "your photo is the face of <event>". This is the
  distribution engine — attendees compete to shoot next week's cover.

### 1.2 Past-proof social line

Recurring event cards show real history instead of weak future counts:
**"12 went · 167 photos last time"** (from the previous occurrence).

- "Went" excludes no-shows (`no_show_at IS NOT NULL`) and seed profiles (Phase 2 hygiene).
- Photo count = published moments on the previous occurrence.
- Stored as denormalized columns on the upcoming event (`last_occurrence_went int`,
  `last_occurrence_photos int`), computed in the same nightly write-time pass as 1.1 —
  no rewriting fragile RPCs, cards just read two extra columns.
- i18n: new keys added to **all 12 locale files** before component use.

### 1.3 Never render "0 going"

Card logic: going-count below 3 is not rendered. Show the past-proof line (1.2) or organizer
chip instead. Capacity events: show "x/N" only when x ≥ 3; otherwise show "N spots".

### 1.4 Organizer auto-RSVP everywhere (guarded)

- **Forward:** series occurrence generation inserts the creator's RSVP for each occurrence.
- **Skip import/service accounts** (Luma/Facebook/Instagram/dalat-gov importers) — one
  importer avatar "going" to 200 scraped events is anti-social-proof and would pollute
  `get_recommended_events` (ranks by ln(1+going)).
- **Backfill: upcoming events only**, with three pipeline guards (red-team findings):
  - backdate `rsvps.created_at` beyond the 7-day `get_friend_activity()` window (no feed flood);
  - pre-stamp `reminder_7d/24h/2h_sent_at` (no push-spamming organizers about their own events);
  - never backfill past events (`auto_mark_no_shows()` would brand organizers no-shows).

### 1.5 CI ratchet

Test asserting the two Goals against homepage feed output. Fails the build on regression.

## Phase 2 — Ghost Boost (hardened, kill-switchable)

Small seeded attendance while the app is young. Explicitly chosen by Yan; scoped to be
undetectable, non-blocking, and removable in one statement.

- **Roster privacy:** ghosts are ordinary `profiles` rows; membership lives ONLY in a new
  `seed_profiles(profile_id)` table with **no anon/authenticated grants** (service-role only).
  No `is_seed` column on public tables — `profiles` RLS is `SELECT USING (true)` and an
  exposed flag would be one curl away from a screenshot.
- **Roster:** ~12 profiles, plausible mixed Vietnamese/expat names, short bios,
  AI-generated (non-real-person) avatars uploaded to R2 `avatars` bucket.
  Ghosts **never** post, comment, follow, or appear in anything but RSVP lists.
- **Seeding:** hourly cron; eligible events = published, starts within 7 days,
  **`capacity IS NULL` only** (ghosts can never block a real person or interact with the
  waitlist/`promote_from_waitlist()` machinery), real going < 3. Adds at most 1 ghost RSVP
  per event per run with random skip → naturally jittered timestamps, max 2–3 per event.
  Ghost RSVPs get reminder fields pre-stamped.
- **Withdrawal:** same hourly cron deletes ghost RSVPs when the event starts within 3 hours.
- **Stats hygiene:** all Phase 1 "went last time" counts and any loyalty/leaderboard queries
  exclude `seed_profiles` — a missed withdrawal can never poison the real-history numbers.
- **Kill switch:** `GHOST_BOOST_ENABLED` env flag (default off); full purge is one DELETE
  joining `seed_profiles`.

## Non-goals

- No fake moments, comments, follows, or messages — ghosts RSVP only.
- No modification to `get_homepage_moments_strip` ORDER BY or the homepage feed RPC family.
- No backfill of past-event RSVPs.

## Rollout order

1. Phase 1 migrations → `supabase db push` → **verify in `schema_migrations`** (global rule).
2. Fallback-cover backfill + nightly cron.
3. Card UI (cover fallback, past-proof line, hide-low-counts, photographer chip) + i18n ×12.
4. CI ratchet test.
5. Phase 2 behind `GHOST_BOOST_ENABLED=false`; Yan flips it on.

## Dependency note

Uncommitted migrations from other AI sessions exist in the working tree
(`20260803b_001_smart_reminders.sql`, `20260731_001_plus_one_guests.sql`, etc.). The
reminder pre-stamp guard in 1.4 assumes the smart-reminders migration lands; the plan must
check applied state before relying on those columns.
