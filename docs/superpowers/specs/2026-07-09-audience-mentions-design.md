# Audience Mentions — `@all` / `@<tag>` Admin Invite Blasts

**Date:** 2026-07-09
**Status:** Approved by Yan (design), pending implementation
**Goal:** Let admins re-engage dormant users and boost event exposure by inviting an entire audience (`@all` = everyone, `@games` = recent games-goers) from the existing Invite Guests modal. Each recipient gets a **personal invitation** (push + email + in-app) with a **one-tap, no-login RSVP**.

## Context

- ~177 registered users, 12 locales. Dormant users have expired sessions and dead push subscriptions — **email is the only channel that reaches them**, and they will not log in to RSVP.
- Design was red-teamed + 10x-paneled on 2026-07-09; all findings below are code-verified.

## Semantics (decided)

`@all`-ing an event creates a **real per-user invitation** (`event_invitations` row with `claimed_by` pre-set), not an anonymous broadcast. This gives per-blast funnel measurement and "Yan invited you" framing.

## 1. UX — inside `components/events/invite-modal.tsx`

- When a user with `role_level >= admin` types `@`, pinned audience rows render **above** normal user search results:
  - `@all · Everyone (N)`
  - `@<tag> · <Tag label> (N)` for each activity tag with a non-empty audience (from `EVENT_TAGS` taxonomy)
- Counts resolve live via a single API call (`GET /api/audiences?q=`) — **no new tables, no pinning system, no audience CRUD**.
- Selecting adds an **audience chip** (`@games · 34`). Mixing audience chips with normal user/email chips is allowed.
- The send button label "Send N invites" (N = resolved total) **is** the confirmation. No extra dialog.
- Optional **personal note** textarea (reuse `AIEnhanceTextarea`) shown only when an audience chip is present. The note is deliberately NOT machine-translated — a human note in the sender's own words is the point. Template chrome stays localized.
- Non-admins never see audience rows; server enforces the role regardless.

### Audience resolution (server-side, service role)

- `@all`: all profiles except exclusions.
- `@<tag>`: users with an RSVP (`going` or `interested`) in the **last 4 months** on events whose `ai_tags` contains the tag. (All-time + AI-tagged is noisy; recency makes `@games` mean "actually plays games".)
- **Exclusions** (resolved by `claimed_by` and `rsvps` — NOT by email-collision, since synthetic `user-<id>@dalat.app` emails don't collide with a prior real-email invite for the same person):
  - users already invited to this event (any invitation row with `claimed_by = user`)
  - users already RSVP'd to this event
  - the sender
  - users with `audience_blast` emails unsubscribed (see §4)
  - **frequency cap:** users who received any audience blast in the last 30 days (server-enforced; protects active users from notification fatigue)

## 2. Delivery pipeline

### API

Extend `POST /api/events/[slug]/invitations` with `audiences?: string[]` (`"all"` or a valid `EventTag`), plus `personalNote?: string`.

1. Verify `role` is `admin`/`superadmin` (role hierarchy in `lib/types/index.ts`). Non-admin + audiences → 403.
2. Resolve audience → user IDs with exclusions (above).
3. Batch-insert `event_invitations` rows: `claimed_by = user_id`, synthetic email, `status = 'pending'`, `ON CONFLICT DO NOTHING` (skip silently — never re-send on duplicate; the existing 23505 "resend" path is explicitly NOT reused for audiences). Rows carry `audience` (new nullable text column, e.g. `'all'` / `'games'`) — this single column powers both the 30-day frequency cap ("has an `audience IS NOT NULL` invitation in the last 30 days") and per-blast analytics. Migration → **Tier A, confirm before applying**.
4. Enqueue **one Inngest event** (`invitations/audience.blast`) with event id + invitation ids + note; return immediately with `{ queued: N }`.
5. Existing `check_invite_quota` stays as-is — admins already get `allowed: true` (verified in `20260414_001_open_invitations.sql`). No bypass code.

### Inngest fan-out (`lib/inngest/functions/audience-blast.ts`)

- **Each recipient is its own `step.run`, keyed on invitation id and gated on `status != 'sent'`** — otherwise Inngest retries re-notify everyone already sent.
- Per user: fetch locale → `notify()` with new type `audience_invitation` → mark invitation `sent` + `sent_at`.
- Throttle to respect Resend limits. **Resend quota-exhausted errors are terminal-for-today** (NonRetriableError + reschedule remainder for next day), not blind retries.
- Partial-failure report logged; no silent `catch → []`.

### Notification type

- Add `audience_invitation: ['email', 'push', 'in_app']` to `DEFAULT_CHANNELS` in `lib/notifications/preferences.ts`. **Do not use forced `options.channels`** — forced channels bypass the entire preference layer (`lib/notifications/index.ts:86`).
- New template in `lib/notifications/templates.ts` localized for **all 12 locales** (existing templates only cover en/fr/vi — this type ships with all 12; backfilling other types is out of scope).

## 3. The email — conversion lever

- CTA is the **existing token one-tap RSVP**: `POST /api/invite/[token]/rsvp` already writes a real `rsvps` row with no auth when `claimed_by` is set. Email button "I'm in 🎉" → token link → on the guest list + `.ics` calendar link, zero typing, zero login.
- Sender identity: from-name is the admin's display name; personal note rendered prominently if present.
- Token landing page (existing) additionally surfaces: plus-one form (`plus_one_guests.invitation_id` FK already exists) and WhatsApp share. **Zalo share for `vi` locale** and moments-photo-in-email are Phase 3.

## 4. Phase 0 prerequisite — email unsubscribe (currently DOES NOT EXIST)

Code-verified gaps: no `List-Unsubscribe` headers, no footer unsubscribe link, and `notification_preferences` has zero writers (`updateUserPreferences` has no callers; settings UI only manages the push subscription).

Ship first, as its own PR:

- Add `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers and a footer unsubscribe link to the shared email channel (`lib/notifications/channels/email.ts`).
- Tokenized one-click unsubscribe endpoint (`GET/POST /api/email/unsubscribe?token=`) that writes `email_enabled = false` (or a granular `audience_blasts = false`) to `notification_preferences` — the first real writer of that table. Granular preference: mute audience blasts without killing personal invites/transactional email.
- Signed token = HMAC(user_id, secret) — no DB table needed.
- Migration required for any `notification_preferences` column addition → **Tier A, confirm with Yan before applying**.

**Resend capacity:** free tier = 100 emails/day; `@all` = ~177. Decision needed from Yan: upgrade Resend (~$20/mo, recommended) or accept the job auto-spreading a full blast across 2 days.

## 5. Measurement

- Funnel per blast: `event_invitations.sent_at → viewed_at → responded`, joined to `rsvps` on `claimed_by` — **not** `rsvp_status` alone (only the token flow writes it; in-app RSVPs would read as 0% forever). If cheap, backfill `responded_at` via trigger/join at read time.
- Success goal: **≥10% of 60-day-dormant invitees RSVP within 7 days** of the first blast.
- Explicitly do NOT use `login_events` (0 rows ever — known void-RPC bug).

## 6. Guardrails summary

| Risk | Mitigation |
|---|---|
| Duplicate sends on retry | per-user `step.run` gated on `status='sent'`; `ON CONFLICT DO NOTHING` |
| Double-invite via synthetic email | exclusions by `claimed_by`/`rsvps`, not email collision |
| Spam complaints burn domain | Phase 0 unsubscribe headers + link before first blast |
| Notification fatigue | server-enforced ≤1 audience blast per user per 30 days |
| Resend daily cap | terminal-for-today error handling; upgrade decision |
| Locale breakage | new template ships in all 12 locales; UI strings in all 12 `messages/*.json`; gate on `check-i18n` |
| Creator's invite panel floods with ~170 rows | acceptable for now (admin-sent blasts visible to creator); revisit if noisy |

## 7. Ship order

1. **Phase 0** — unsubscribe plumbing (headers + endpoint + preference write) + Resend decision. Independent PR.
2. **Phase 1** — `audience_invitation` type + 12-locale template + idempotent Inngest fan-out + API `audiences[]` support.
3. **Phase 2** — `@` UI in invite modal (pinned audiences, chips, personal note) + `GET /api/audiences`.
4. **Phase 3 (later)** — Zalo share on token landing (`vi`), real moment photo in email, per-blast analytics view.

## 8. Testing

- **E2E proof (the one test that proves everything):** seed a dormant user (zero push subs, no session) → admin sends `@games` → assert invitation row `sent`, email contains token link → from logged-out context POST the token RSVP → assert `rsvps` row exists and invitation `responded`.
- Unit: audience resolver exclusions (already-invited via real email, already-RSVP'd, 30-day cap, unsubscribed).
- Idempotency: re-run fan-out step → no duplicate notifications.
- i18n: `check-i18n` green; template snapshot per locale.
- Gauntlet before push: `safe-build`, `check-i18n`, `check-pill-buttons`, `check-input-zoom`, code review, silent-failure hunt.
