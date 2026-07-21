# Tribes Invite & Share — Phase 2 Design

**Date:** 2026-07-20
**Status:** Approved by Yan (leader-scoped user search with profile opt-out, separate tribe quota, delete the orphaned contacts stack)
**Scope:** Give tribes a way to grow: a share button anyone can use, and per-person invites by email or username for tribe leaders. Phase 1 (tribe chip on events/moments, inline attach) shipped in `6439a4c`.

## Context

Yan's report — *"I don't even have an invite button to invite people in the tribe"* — is literally true, and the cause is deeper than a missing button.

**There is no share or invite affordance anywhere on the tribe surface.** `components/tribes/tribe-header.tsx:104-125` renders exactly two actions, both inside `{isAdmin && (...)}`: a join-requests button (only for `access_type = 'request'`) and a settings gear. Non-admins get nothing. `app/[locale]/tribes/[slug]/page.tsx` and `tribe-tabs.tsx` add nothing.

The only invite affordance in the app is inside `tribe-settings-modal.tsx:367`, gated on:

```tsx
{(accessType === "invite_only" || accessType === "secret") && inviteCode && (
```

**Ungating that would not work**, because `invite_code` is NULL for every other tribe. The generation trigger (`20260130_001_tribes_v2.sql:22-39`) only fires for the same two access types:

```sql
IF NEW.access_type IN ('invite_only', 'secret') AND NEW.invite_code IS NULL THEN
  NEW.invite_code := generate_invite_code();
END IF;
```

Nine of the ten production tribes are `public`, so nine of ten have no code at all. A universal share affordance must share `/tribes/{slug}`, not a code.

### Related dead ends found

- **`invite_code_expires_at` is never written.** Declared in the migration, read by `get_tribe_by_code`, typed in `lib/types/index.ts:310`, and set by nothing — no INSERT, no UPDATE, no route. Every invite code is eternal, and `regenerate_tribe_invite_code` doesn't touch it either.
- **No `GET` on `/api/tribes/[slug]/invite-code`** — POST-to-regenerate only. A code is readable only if already present on the loaded tribe row.
- **`handleCopyCode` (`:169-175`) copies the bare 6-char code, not the URL**, via raw `navigator.clipboard` — bypassing `useShare()` and therefore its in-app-browser fallback and haptics.
- **Hardcoded English at `tribe-settings-modal.tsx:391-395`:** `<p …>Share link: {inviteUrl}</p>` — untranslated, not a link, not copyable. Direct violation of the 12-locale rule.
- **`generate_invite_code()` has no retry loop** — 6 hex chars against a `UNIQUE` constraint; a collision throws rather than retrying.

### Decisions (made with Yan)

1. **User search opens to tribe leaders, with a profile opt-out.** `/api/users/search` currently hard-403s anyone who is not `superadmin`/`admin`/`moderator`, and `invitee-input.tsx:78-81` swallows the error — so a tribe leader typing a username today gets a silently empty dropdown. Leaders get access, but only to profiles that have not opted out.
2. **Tribe invites get their own quota bucket.** The default tier in `check_invite_quota` is 5/day, 20/week (`20260414_001_open_invitations.sql`), so a leader inviting their tribe would 429 on the sixth person — and would burn their event-invite allowance doing it.
3. **Delete the orphaned contacts stack.** See "Deletions" below.

## Components

### 1. Migration (Tier A)

**`tribe_invitations`** — mirrors `event_invitations` (`20260124_001_event_invitations.sql`), which is the proven model:

```
id, tribe_id → tribes ON DELETE CASCADE, invited_by → profiles NOT NULL,
email TEXT NOT NULL, name TEXT, token UUID UNIQUE DEFAULT gen_random_uuid(),
status TEXT CHECK (status IN ('pending','sent','viewed','accepted')),
claimed_by → profiles, sent_at, viewed_at, accepted_at,
UNIQUE (tribe_id, email)
```

Username invites reuse the event path's synthetic-email trick (`invitations/route.ts:296`) — `user-${userId}@dalat.app` — so one table and one unique constraint serve both paths.

- **`get_tribe_invitation_by_token(p_token)`** — `SECURITY DEFINER`, so an anonymous invitee can read the invite. Required for the same reason `20260417_001_invitation_rls_bypass.sql` was.
- RLS: leaders/admins of the tribe may select and insert; the invitee may select their own by token via the RPC only.
- **On accept, set `tribe_members.invited_by`** — the column has existed since `20260130_001` and no code path has ever written it.

**`profiles.discoverable BOOLEAN NOT NULL DEFAULT true`** — backs decision 1. Default true preserves today's behavior; a user can opt out in settings.

**`tribe_invite_quotas` + `check_tribe_invite_quota(p_user_id)`** — separate table and RPC, mirroring the shape of `check_invite_quota` (returns JSONB `{allowed, reason?, remaining_daily, remaining_weekly}`, mapped to HTTP 429). Limits: **30/day, 100/week**; `admin`/`superadmin` unlimited. Deliberately not shared with the event bucket.

**`ALTER TYPE notification_type ADD VALUE 'tribe_invitation'`** — required, and easy to forget: the TS union in `lib/notifications/types.ts` already carries several values with no matching DB enum entry, and those inserts fail at runtime.

Migration version must be chosen from prod `supabase_migrations.schema_migrations`, not from `ls supabase/migrations/` — the repo drifts behind prod (two applied migrations, `20261013` and `20261014`, exist in the database with no file in the repo).

### 2. `TribeShareButton` — `components/tribes/tribe-share-button.tsx`

Modeled on `components/events/event-share-button.tsx`, using `useShare()` from `lib/hooks/use-share.ts` (native share → clipboard fallback → `document.execCommand` fallback for in-app browsers; never passes `files`, per the documented Android link-preview issue).

- **Shown to everyone**, not just admins — this is the "promote tribes" lever.
- URL: `/tribes/{slug}` for `public`/`request`. For `invite_only`/`secret`, `/tribes/join/{invite_code}` when a code exists, since the slug URL would 404 for the recipient.
- Share text in the Dalat vibe, translated, including tribe name and member count.
- Placed in `tribe-header.tsx` beside the existing admin actions, outside the `isAdmin` gate.

### 3. `TribeInviteModal` — `components/tribes/tribe-invite-modal.tsx`

Opened from the tribe header for leaders/admins.

- Uses the **shared** `components/shared/invitee-input.tsx`, not the forked copy inside `components/events/invite-modal.tsx`. That fork exists only to add the `@audience` row type; tribes need no audience blasts, so the shared component fits as-is and we avoid a third copy.
- `InviteeInput` already auto-detects mode (`@username` → user search, else email-shaped → email) with a 300ms debounce.
- Embeds `TribeShareButton` under a "share instead" label, mirroring how `invite-modal.tsx:449` embeds `ShareButtons`.
- Surfaces quota remaining, and renders the 429 reason as a friendly translated message rather than a silent failure.

### 4. `POST /api/tribes/[slug]/invitations`

Body: `{ emails?: string[], users?: string[], personalNote?: string }`.

Authorization: caller must be `leader`/`admin` of the tribe (or site admin) — the same two-sided check Phase 1 established in `PATCH /api/events/[slug]/tribe`, where RLS authorizes the actor but never the target.

- **Email path:** insert `tribe_invitations`, handle `23505` by re-fetching and resending, send via `sendEmailInvitation` with a `tribe_invitation` template, then `status: 'sent'`. Stagger 1s between sends, matching `invitations/route.ts:196` (Resend free-tier rate limit).
- **Username path:** look up the invitee's `profiles.locale`, insert with `claimed_by` pre-linked and a synthetic email, then send an **in-app + push notification in the recipient's locale** — no email. This is strictly better than the email path when we know the user, and it is what the event flow already does.
- Quota checked once for the total, incremented by successes only.

### 5. `/tribes/invite/[token]` landing page

A distinct route rather than overloading `/invite/[token]`, which is event-specific (it renders an event card, RSVP buttons and a `.ics` download). Shows the tribe, who invited you, and a join CTA; signed-out visitors get login-then-continue. On accept: create the `tribe_members` row with `invited_by` set, mark the invitation `accepted`.

### 6. `/api/users/search` — relax and harden

- Allow `superadmin`/`admin`/`moderator` **or** any user who is `leader`/`admin` of at least one tribe.
- Filter to `discoverable = true` (in addition to the existing `is_ghost = false`).
- **Fix the injection-shaped interpolation** at the same time: `query` is currently spliced unescaped into a PostgREST filter string —

  ```ts
  .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
  ```

  A `query` containing a comma or parenthesis alters the filter's structure. This is in scope because the change widens who can reach this endpoint; escaping it is a precondition of that, not an unrelated cleanup.
- Stop `invitee-input.tsx:78-81` from silently swallowing a non-OK response — surface it.

### 7. Notifications

New `tribe_invitation` type and template. **Also fix the four existing tribe notifications**, which all hardcode `locale: 'en'` (`lib/notifications/index.ts:411-473`) and never look up `profiles.locale`, unlike the event path. In scope because we are adding a fifth notification alongside them and would otherwise be copying the defect forward.

### 8. i18n

New keys across all 12 `messages/*.json` before use. Also fixes the hardcoded `Share link:` string in `tribe-settings-modal.tsx`.

`tribes` is already in `CORE_CLIENT_NAMESPACES`, so no registration change and no route-island risk.

### 9. Deletions

Remove the orphaned contacts stack — imported nowhere since Feb 2026, and non-functional:

- `components/tribe/contact-list.tsx`, `components/tribe/contact-upload.tsx` (note the singular `components/tribe/`)
- `app/api/tribes/[slug]/contacts/route.ts`
- `app/api/tribes/[slug]/contacts/bulk-invite/route.ts`

`bulk-invite` selects `events.start_time` and `events.location_address`; the real columns are `starts_at` and `address`. PostgREST 400s on the unknown column, so the route returns `404 Event not found` before it can ever send. It is a live, admin-gated endpoint that appears functional and is not. Deleting is safer than leaving it — this branch replaces its purpose.

## Explicitly out of scope

- Mass "invite everyone on dalat.app" blast (Yan declined in Phase 1).
- CSV contact upload / tribe mailing lists.
- Setting `invite_code_expires_at` — recorded as dead, not revived here.
- A retry loop in `generate_invite_code()`.
- Chip-level join on moments surfaces.

## Accepted risks

- **Invite emails will be English for 9 of 12 locales.** `lib/notifications/templates.ts:45-51` supports only `en`/`fr`/`vi`. This matches how event invitations already behave, so tribe invites are no worse — but it is the single largest gap in the notification layer and should be its own project. The username path is unaffected: it uses in-app/push in the recipient's real locale.
- **Opening user search to tribe leaders widens the directory surface.** Anyone can create a tribe and become its leader, so in practice this approaches "any motivated signed-in user". `discoverable` is the mitigation; rate-limiting the endpoint is the follow-up if abuse appears.
- **`profiles.discoverable` defaults to true**, so existing users are searchable until they opt out. Defaulting to false would silently break invite-by-username for all 187 existing users.

## Verification

1. Migration confirmed applied against prod `schema_migrations`; `tribe_invitations` present; `notification_type` includes `tribe_invitation`.
2. Build green including the client-namespace guard; deploy polled to **success** before the session ends.
3. Share button appears for a signed-out visitor on a public tribe and copies `/tribes/{slug}`.
4. Leader invites by email → row created, email delivered, token page joins the tribe, `tribe_members.invited_by` populated.
5. Leader invites by username → recipient gets an in-app notification **in their own locale**, no email sent.
6. **Authorization, tested as a non-admin** (a superadmin bypasses every guard, so an admin account cannot verify this): a non-leader posting to `/api/tribes/[slug]/invitations` gets 403; the 31st invite in a day gets 429.
7. A profile with `discoverable = false` does not appear in leader user-search results.
8. All 12 locales render the new surfaces with zero `MISSING_MESSAGE`.
