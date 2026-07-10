# Secret Address (guests-only event details)

**Date:** 2026-07-09 · **Status:** Approved by Yan (build + push authorized)

## Problem

Hosts advertising house events (e.g. Poker Night) on Facebook don't want to
publish their home address. They want the public page to show only an area
hint, with the exact address revealed to confirmed guests — including a
morning-of delivery by email/push.

## Decisions (locked with Yan)

1. **Access gate:** anyone with RSVP `status='going'` (no approval flow).
2. **Public view:** area label (reuses `location_name`) + 🔒 lock hint. No map pin.
3. **Delivery:** page reveal immediately after RSVP **+** morning-of email/push.
4. **UI:** a "Secret address" checkbox on the event form with an inline explainer.

## Architecture

- `events.has_private_details boolean` — the flag.
- `event_private_details` table (`address`, `google_maps_url`, `latitude`,
  `longitude`, `arrival_notes`) with RLS: SELECT for admin/host/going-RSVP;
  writes host/admin only. The privacy boundary lives in Postgres because the
  anon key exposes the REST API directly — UI stripping protects nothing.
- **Write-side invariant (red team K2):** BEFORE trigger on `events` force-NULLs
  `address`/`latitude`/`longitude`/`google_maps_url` when the flag is on. All
  feeds, sitemap, OG, JSON-LD, map views read `events.*` → safe by construction.
- **Morning-of send (red team K3):** one `scheduled_notifications` row per
  event (`type='event_address_reveal'`), created by an AFTER trigger on events,
  scheduled for `min(8am Asia/Ho_Chi_Minh event day, starts_at − 2h)`. The
  Inngest per-minute processor resolves the **current** going roster and
  **current** address at send time — correct against waitlist promotions,
  cancellations, and address edits. Host excluded from send.
- Event page: RLS-gated fetch of private details; lock hint for non-going,
  full block (address, map link, arrival notes) for host/going. Private data
  is passed to `AddToCalendar`/`RsvpButton`/`FloatingRsvpBar` only when
  authorized, and never flows into `generateMetadata`/OG/JSON-LD.
- `arrival_notes` (freeform, guests-only) carries door codes, parking tips,
  and Zalo/WhatsApp group links — the cheap replacement for actual
  WhatsApp/Zalo integration.

## v1 exclusions

- **Series/recurring events:** checkbox hidden (red team K1 — series spawn
  copies addresses into public rows). Fast-follow.
- **Venue-based locations:** checkbox hidden (venues are public entities).
- Plus-one guests without accounts rely on their host to relay the address.
- WhatsApp/Zalo sending, fuzzy map circle.
- Secret events don't appear on map browse (NULL coords) — accepted.

## Verification

`scripts/check-secret-address.mjs` — as anon: fetch event page HTML, REST API
(`events`, `event_private_details`), and assert a canary event's sentinel
address appears nowhere. Run post-deploy.
