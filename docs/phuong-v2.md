# Phương collaboration V2 — 2026-09-11

## Delivery scope
P0 launch: short EN/VI/FR planner, birthday choice/alternate date/idea/private
birthday, optional venue baseline, private event brief, asynchronous messages,
manual normal-night/experiment comparison, progress history and V1 archive.

Main host roots map to the existing localized collaboration route. `/archive/v1`
and `/vi/archive/v1`, `/fr/archive/v1` rewrite to its nested archive page. V1
content, five server answers, historical localStorage key and author-only policies
are preserved. V1 language links remain in the archive and a return link opens V2.
No public navigation or sitemap entry was added; metadata remains noindex.

## Reuse and deliberate cuts
Existing Supabase authentication, next-intl dictionaries, design tokens, Button,
Next Image, original portraits, notifications table/Realtime/bell are reused.
Portrait faces are untouched; party hats are CSS overlays.

EventForm already includes FlyerBuilder, image queue/upload, venue linking,
translations, RSVP and celebration links. It currently inserts published events
before image upload and does not expose the requested draft-preview-confirm
transaction. No matching Đường 1 Chill venue was found. To avoid surprise or
incomplete publication, V2 only saves a PRIVATE BRIEF. Its link opens the existing
creation tools; it does not prefill, create a draft event, generate a flyer or
publish an event. P1 draft/publish integration is deferred, not simulated.
No RSVP or analytics counts are fabricated. Event measurement ideas are labelled
as future; manual customer/revenue comparisons are available privately.

## Storage / authorization
`phuong_members` admits only verified accounts @hieuanhnhaden (Phương) and @yan
(Zan). `phuong_plan` holds the latest structured plan with optimistic versioning.
`phuong_actions` retains immutable explicit submissions and messages. No V1 tables
are changed. `/api/phuong-plan` uses verified sessions, schema validation and
no-store responses. Anonymous users and other signed-in users cannot read data.
Both participants can review; only Phương edits her plan. Both may leave notes.
Database writes go through the restricted `submit_phuong_action` RPC; direct table
writes and dangerous default TRUNCATE privileges are not granted. Unsaved text is
in memory with navigation warnings, not localStorage; explicit Save persists it.

## Notifications
Phương's explicit decision, baseline, brief, results or message submissions create
one in-app notification for @yan in the same transaction. An idempotency UUID
prevents retry duplicates. Notifications contain generic status text and a private
planner link, never business figures or message content. Passive views/typing send
nothing. Email, push and Telegram are not enabled by this feature. No launch/test
message was sent; transactional security probes and notifications were rolled back.

## Validation
Production database transaction verified participant access, outsider denial,
Phương-only plan edits, version conflicts, idempotency and one notification per
action; all probes rolled back. Original V1 answer count remains five. Browser
fixture used synthetic local-only data to exercise phone date entry and explicit
Save without writing real participant data. Interception was cleared afterward.
Tests cover translations, default consent, validation, private-birthday conditional
UI, reviewer restrictions and archive rewrites. Existing notification staleness
supports the new in-app-only collaboration type without expiring it automatically.

## Next manual checks
Each participant should sign in on phuong.dalat.app (sessions are host-scoped).
Phương can save her choice; Zan should see it and the bell notification. Confirm
venue address/record, date, start time, drink economics, consent and public media
before using the normal event publishing tools. The planner is not an event draft.
