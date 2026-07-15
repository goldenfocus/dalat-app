# Audience Mentions (`@all` / `@<tag>`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-only audience mentions in the event Invite Guests modal — `@all` / `@games` resolve to real per-user invitations delivered via email (with one-tap token RSVP) + push + in-app, fanned out by an idempotent Inngest job.

**Architecture:** Phase 0 adds email unsubscribe plumbing (HMAC tokens, `List-Unsubscribe` headers, preference writes) that must exist before any blast. Phase 1 adds the `audience_invitation` notification type (12-locale template), an audience resolver, and the Inngest fan-out. Phase 2 adds the `@` UI in the invite modal + a counts endpoint.

**Tech Stack:** Next.js 16 App Router, Supabase (service-role for resolution/fan-out), Inngest, Resend, next-intl (12 locales), vitest.

**Worktree:** `.worktrees/audience-mentions` (branch `audience-mentions`). All paths below are relative to the worktree root.

**Spec:** `docs/superpowers/specs/2026-07-09-audience-mentions-design.md`

**Non-negotiable repo rules that apply here:**
- Every user-visible UI string → key in ALL 12 `messages/*.json` files FIRST.
- Migration file: pure numeric timestamp, no letters (letters = silent skip), unique version → `20260711_001`.
- Applying the migration to prod is **Tier A — confirm with Yan first**. Writing the file is fine.
- `git add` by explicit path only. Never `git add -A`.

---

## Phase 0 — Email unsubscribe plumbing

### Task 1: Unsubscribe token helper

**Files:**
- Create: `lib/notifications/unsubscribe.ts`
- Test: `lib/notifications/unsubscribe.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/notifications/unsubscribe.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
} from './unsubscribe';

describe('unsubscribe tokens', () => {
  beforeEach(() => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-secret');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dalat.app');
  });

  it('round-trips a valid token', () => {
    const token = createUnsubscribeToken('user-123', 'audience');
    expect(token).toBeTruthy();
    expect(verifyUnsubscribeToken(token!)).toEqual({
      userId: 'user-123',
      scope: 'audience',
    });
  });

  it('rejects a tampered token', () => {
    const token = createUnsubscribeToken('user-123', 'audience')!;
    const tampered = token.replace('user-123', 'user-456');
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it('rejects a token with an invalid scope', () => {
    const token = createUnsubscribeToken('user-123', 'all')!;
    const forged = token.replace('.all.', '.everything.');
    expect(verifyUnsubscribeToken(forged)).toBeNull();
  });

  it('rejects garbage', () => {
    expect(verifyUnsubscribeToken('not-a-token')).toBeNull();
    expect(verifyUnsubscribeToken('a.b.c')).toBeNull();
  });

  it('builds a URL containing the token', () => {
    const url = buildUnsubscribeUrl('user-123', 'all');
    expect(url).toContain('https://dalat.app/api/email/unsubscribe?token=');
  });

  it('returns null when no secret is configured', () => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(createUnsubscribeToken('user-123', 'all')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/notifications/unsubscribe.test.ts`
Expected: FAIL — cannot resolve `./unsubscribe`

- [ ] **Step 3: Write the implementation**

```ts
// lib/notifications/unsubscribe.ts
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Stateless, signed unsubscribe tokens for email links.
 * scope 'all'      → email_enabled = false (kills all notification emails)
 * scope 'audience' → mutes audience_invitation blasts only (keeps personal invites)
 */
export type UnsubscribeScope = 'all' | 'audience';

const SCOPES: UnsubscribeScope[] = ['all', 'audience'];

function getSecret(): string | null {
  return (
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    null
  );
}

function sign(userId: string, scope: UnsubscribeScope, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${userId}:${scope}`)
    .digest('base64url');
}

export function createUnsubscribeToken(
  userId: string,
  scope: UnsubscribeScope
): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return `${userId}.${scope}.${sign(userId, scope, secret)}`;
}

export function verifyUnsubscribeToken(
  token: string
): { userId: string; scope: UnsubscribeScope } | null {
  const secret = getSecret();
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, scope, sig] = parts;
  if (!userId || !SCOPES.includes(scope as UnsubscribeScope)) return null;

  const expected = sign(userId, scope as UnsubscribeScope, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { userId, scope: scope as UnsubscribeScope };
}

export function buildUnsubscribeUrl(
  userId: string,
  scope: UnsubscribeScope
): string | null {
  const token = createUnsubscribeToken(userId, scope);
  if (!token) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://dalat.app';
  return `${base}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/notifications/unsubscribe.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/unsubscribe.ts lib/notifications/unsubscribe.test.ts
git commit -m "feat(notifications): signed unsubscribe tokens (all/audience scopes)"
```

### Task 2: `List-Unsubscribe` headers + footer link in the email channel

**Files:**
- Modify: `lib/notifications/channels/email.ts`

- [ ] **Step 1: Extend `SendEmailOptions` and the send call**

In `lib/notifications/channels/email.ts`, change the interface (line ~19):

```ts
export interface SendEmailOptions {
  to: string;
  content: EmailNotificationContent;
  replyTo?: string;
  /** Tokenized unsubscribe URL. When present, adds List-Unsubscribe headers + footer link. */
  unsubscribeUrl?: string;
}
```

In `sendEmailNotification`, destructure it and pass headers + thread it into the generators (the `try` block, line ~42):

```ts
  const { to, content, replyTo, unsubscribeUrl } = options;
  // ... existing client check ...
  try {
    const inspiringFooter = getRandomInspiringFooter();
    const html = content.html || generateDefaultEmailHtml(content, inspiringFooter, unsubscribeUrl);
    const text = content.text || generateDefaultEmailText(content, inspiringFooter, unsubscribeUrl);

    const result = await client.emails.send({
      from: 'Dalat Events <events@dalat.app>',
      to,
      subject: content.subject,
      html,
      text,
      replyTo,
      ...(unsubscribeUrl
        ? {
            headers: {
              'List-Unsubscribe': `<${unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        : {}),
    });
```

- [ ] **Step 2: Add the footer link to both generators**

`generateDefaultEmailHtml(content, inspiringFooter, unsubscribeUrl?)` — new param `unsubscribeUrl?: string`. In the footer `<div>` (after the "Sent via" `<p>`, line ~183):

```ts
    ${unsubscribeUrl ? `
    <p style="font-size: 12px; color: #9ca3af; margin: 8px 0 0 0;">
      <a href="${unsubscribeUrl}" style="color: #9ca3af; text-decoration: underline;">Unsubscribe</a>
    </p>
    ` : ''}
```

`generateDefaultEmailText(content, inspiringFooter, unsubscribeUrl?)` — after the "Sent via" line:

```ts
  if (unsubscribeUrl) {
    lines.push('', `Unsubscribe: ${unsubscribeUrl}`);
  }
```

(`sendBulkEmails` is untouched — the fan-out uses `notify()`, not the batch API.)

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no NEW errors in `lib/notifications/channels/email.ts` (pre-existing errors elsewhere are not yours).

- [ ] **Step 4: Commit**

```bash
git add lib/notifications/channels/email.ts
git commit -m "feat(email): List-Unsubscribe headers + footer link when unsubscribe URL provided"
```

### Task 3: Unsubscribe endpoint (GET confirmation + POST one-click)

**Files:**
- Create: `app/api/email/unsubscribe/route.ts`

No migration needed — `notification_preferences` already has `email_enabled` and `channel_preferences` jsonb; `updateUserPreferences` upserts. Granular scope writes `channel_preferences.audience_invitation = ['in_app']` (in-app survives; email+push muted).

- [ ] **Step 1: Write the route**

```ts
// app/api/email/unsubscribe/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyUnsubscribeToken, type UnsubscribeScope } from '@/lib/notifications/unsubscribe';
import {
  getUserPreferences,
  updateUserPreferences,
} from '@/lib/notifications/preferences';
import type { Locale } from '@/lib/types';

// Minimal localized copy for the confirmation page (email land — outside next-intl routing,
// same hardcoded-map pattern as lib/notifications/templates.ts)
const COPY: Record<Locale, { done: string; note: string }> = {
  en: { done: "You're unsubscribed", note: 'You can change this anytime in your notification settings on dalat.app.' },
  vi: { done: 'Bạn đã hủy đăng ký', note: 'Bạn có thể thay đổi bất cứ lúc nào trong cài đặt thông báo trên dalat.app.' },
  ko: { done: '수신 거부되었습니다', note: 'dalat.app의 알림 설정에서 언제든지 변경할 수 있습니다.' },
  zh: { done: '已退订', note: '您可以随时在 dalat.app 的通知设置中更改。' },
  ru: { done: 'Вы отписались', note: 'Вы можете изменить это в любое время в настройках уведомлений на dalat.app.' },
  fr: { done: 'Vous êtes désabonné', note: 'Vous pouvez modifier cela à tout moment dans vos paramètres de notification sur dalat.app.' },
  ja: { done: '配信停止しました', note: 'dalat.app の通知設定でいつでも変更できます。' },
  ms: { done: 'Anda telah berhenti melanggan', note: 'Anda boleh mengubahnya bila-bila masa dalam tetapan pemberitahuan di dalat.app.' },
  th: { done: 'ยกเลิกการรับอีเมลแล้ว', note: 'คุณเปลี่ยนได้ทุกเมื่อในการตั้งค่าการแจ้งเตือนบน dalat.app' },
  de: { done: 'Du bist abgemeldet', note: 'Du kannst das jederzeit in deinen Benachrichtigungseinstellungen auf dalat.app ändern.' },
  es: { done: 'Suscripción cancelada', note: 'Puedes cambiarlo en cualquier momento en tu configuración de notificaciones en dalat.app.' },
  id: { done: 'Kamu berhenti berlangganan', note: 'Kamu bisa mengubahnya kapan saja di pengaturan notifikasi dalat.app.' },
};

async function applyUnsubscribe(userId: string, scope: UnsubscribeScope): Promise<boolean> {
  if (scope === 'all') {
    return updateUserPreferences(userId, { email_enabled: false });
  }
  // Granular: mute audience blasts only (keep in-app so nothing is silently lost)
  const prefs = await getUserPreferences(userId);
  const channel_preferences = {
    ...(prefs?.channel_preferences ?? {}),
    audience_invitation: ['in_app'],
  } as NonNullable<Parameters<typeof updateUserPreferences>[1]['channel_preferences']>;
  return updateUserPreferences(userId, { channel_preferences });
}

async function getUserLocale(userId: string): Promise<Locale> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return 'en';
  const admin = createClient(url, serviceKey);
  const { data } = await admin.from('profiles').select('locale').eq('id', userId).single();
  return ((data?.locale as Locale) || 'en');
}

// GET — human clicks the footer link
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') || '';
  const verified = verifyUnsubscribeToken(token);

  if (!verified) {
    return new NextResponse('Invalid unsubscribe link', { status: 400 });
  }

  const ok = await applyUnsubscribe(verified.userId, verified.scope);
  if (!ok) {
    return new NextResponse('Something went wrong. Please try again.', { status: 500 });
  }

  const locale = await getUserLocale(verified.userId);
  const copy = COPY[locale] ?? COPY.en;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${copy.done}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#f9fafb;">
  <div style="text-align:center; padding:40px; max-width:400px;">
    <p style="font-size:48px; margin:0 0 16px;">👋</p>
    <h1 style="font-size:22px; color:#111827; margin:0 0 12px;">${copy.done}</h1>
    <p style="font-size:15px; color:#6b7280; margin:0;">${copy.note}</p>
  </div>
</body></html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// POST — RFC 8058 one-click unsubscribe (mail clients call this, no UI)
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') || '';
  const verified = verifyUnsubscribeToken(token);

  if (!verified) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const ok = await applyUnsubscribe(verified.userId, verified.scope);
  return ok
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: 'Failed' }, { status: 500 });
}
```

Note: if the `channel_preferences` type cast fights you, simplify to `as Record<string, string[]>` cast at the `updateUserPreferences` call — the column is jsonb, runtime shape is what matters.

- [ ] **Step 2: Verify compile + route exists**

Run: `npx tsc --noEmit 2>&1 | grep unsubscribe`
Expected: no output (no errors in the new files).

- [ ] **Step 3: Commit**

```bash
git add app/api/email/unsubscribe/route.ts
git commit -m "feat(email): one-click unsubscribe endpoint — first writer of notification_preferences"
```

### Task 4: Thread unsubscribe URL through `notify()`

**Files:**
- Modify: `lib/notifications/index.ts` (email branch of `notify()`, line ~132)

- [ ] **Step 1: Import + pass the URL**

Add import at top of `lib/notifications/index.ts`:

```ts
import { buildUnsubscribeUrl } from './unsubscribe';
```

In the email branch of `notify()` (currently `sendEmailNotification({ to: userEmail, content: template.email })`), replace with:

```ts
  if (enabledChannels.includes('email') && template.email) {
    const userEmail = await getUserEmail(payload.userId);
    if (userEmail) {
      const scope = payload.type === 'audience_invitation' ? 'audience' : 'all';
      sendPromises.push(
        sendEmailNotification({
          to: userEmail,
          content: template.email,
          unsubscribeUrl: buildUnsubscribeUrl(payload.userId, scope) ?? undefined,
        }).then((result) => {
          results.push(result);
        })
      );
    } else {
      // ... existing else branch unchanged
```

Note: `'audience_invitation'` doesn't exist as a type yet — Task 6 adds it. Until then, write the comparison as `payload.type === ('audience_invitation' as NotificationType)` OR do Tasks 4 and 6 in the same session and just compile after Task 6. Preferred: implement Task 6 first if the comparison errors.

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit 2>&1 | grep "lib/notifications/index" | head -5`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/index.ts
git commit -m "feat(notifications): all notification emails carry unsubscribe URL"
```

---

## Phase 1 — Audience invitations backend

### Task 5: Migration — `audience` column on `event_invitations`

**Files:**
- Create: `supabase/migrations/20260806_001_audience_invitations.sql`

⚠️ **Numeric-only version, unique date** (letters in the timestamp are silently skipped by the runner; `20260806` avoids same-day collisions). **Writing the file now; APPLYING to prod is Tier A — confirm with Yan at push time.**

- [ ] **Step 1: Write the migration**

```sql
-- Audience invitations: mark invitation rows created by an admin audience blast
-- (@all / @games). Powers the 30-day per-user blast cooldown and per-blast analytics.

ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS audience TEXT;

COMMENT ON COLUMN event_invitations.audience IS
  'Non-null when this invitation was created by an admin audience blast. Value = audience key (all, games, yoga, ...).';

-- Fast lookup for the 30-day cooldown check (claimed_by + created_at, blasts only)
CREATE INDEX IF NOT EXISTS idx_invitations_audience_cooldown
  ON event_invitations (claimed_by, created_at)
  WHERE audience IS NOT NULL;
```

- [ ] **Step 2: Commit (file only — DO NOT apply yet)**

```bash
git add supabase/migrations/20260806_001_audience_invitations.sql
git commit -m "feat(db): audience column on event_invitations for blast cooldown + analytics"
```

### Task 6: `audience_invitation` notification type

**Files:**
- Modify: `lib/notifications/types.ts`
- Modify: `lib/notifications/preferences.ts`

- [ ] **Step 1: Add the type + payload**

In `lib/notifications/types.ts`:

1. `NotificationType` union (after `| 'event_address_reveal'`):
```ts
  // Admin audience blast (@all / @games)
  | 'audience_invitation';
```

2. New payload interface (after `UserInvitationPayload`, line ~201):
```ts
export interface AudienceInvitationPayload extends EventNotificationPayload {
  type: 'audience_invitation';
  inviterName: string;
  startsAt: string;
  /** event_invitations.token — powers the no-login one-tap RSVP link in email */
  token: string;
  personalNote?: string | null;
}
```

3. Add `| AudienceInvitationPayload` to the `NotificationPayload` union (after `| UserInvitationPayload`).

- [ ] **Step 2: Add default channels**

In `lib/notifications/preferences.ts`, `DEFAULT_CHANNELS` (after the `event_address_reveal` entry):

```ts
  // Admin audience blasts - all channels; email is the one that reaches dormant users
  audience_invitation: ['in_app', 'push', 'email'],
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit 2>&1 | grep -E "lib/notifications/(types|preferences|templates)" | head`
Expected: ONE error — `templates.ts` switch is not exhaustive for `audience_invitation` (fixed in Task 7). If the switch has a default arm and there's no error, fine too.

- [ ] **Step 4: Commit**

```bash
git add lib/notifications/types.ts lib/notifications/preferences.ts
git commit -m "feat(notifications): audience_invitation type — in_app+push+email defaults"
```

### Task 7: 12-locale template

**Files:**
- Modify: `lib/notifications/templates.ts`

The existing `translations` map only covers en/fr/vi. This template ships ALL 12 locales via its own full-locale map (do NOT route through `getNotificationLocale`).

- [ ] **Step 1: Add the import**

Add `AudienceInvitationPayload` to the type imports at the top of `lib/notifications/templates.ts`.

- [ ] **Step 2: Add the full-locale strings + template function**

Add before `getNotificationTemplate` (near the other template functions):

```ts
// ============================================
// Audience invitation (@all / @games blasts) — ALL 12 locales
// ============================================

const AUDIENCE_LOCALE_TAG: Record<Locale, string> = {
  en: 'en-US', vi: 'vi-VN', ko: 'ko-KR', zh: 'zh-CN', ru: 'ru-RU', fr: 'fr-FR',
  ja: 'ja-JP', ms: 'ms-MY', th: 'th-TH', de: 'de-DE', es: 'es-ES', id: 'id-ID',
};

const audienceStrings: {
  title: Record<Locale, (inviter: string, title: string) => string>;
  imIn: Record<Locale, string>;
  viewEvent: Record<Locale, string>;
} = {
  title: {
    en: (inviter, title) => `${inviter} invited you to "${title}"`,
    vi: (inviter, title) => `${inviter} đã mời bạn tham gia "${title}"`,
    ko: (inviter, title) => `${inviter}님이 "${title}"에 초대했어요`,
    zh: (inviter, title) => `${inviter} 邀请你参加「${title}」`,
    ru: (inviter, title) => `${inviter} приглашает вас на «${title}»`,
    fr: (inviter, title) => `${inviter} vous invite à "${title}"`,
    ja: (inviter, title) => `${inviter}さんが「${title}」に招待しました`,
    ms: (inviter, title) => `${inviter} menjemput anda ke "${title}"`,
    th: (inviter, title) => `${inviter} ชวนคุณไปงาน "${title}"`,
    de: (inviter, title) => `${inviter} hat dich zu "${title}" eingeladen`,
    es: (inviter, title) => `${inviter} te invitó a "${title}"`,
    id: (inviter, title) => `${inviter} mengundangmu ke "${title}"`,
  },
  imIn: {
    en: "I'm in 🎉", vi: 'Tham gia ngay 🎉', ko: '참석할래요 🎉', zh: '我要参加 🎉',
    ru: 'Я иду 🎉', fr: "J'y serai 🎉", ja: '参加します 🎉', ms: 'Saya datang 🎉',
    th: 'ไปด้วย 🎉', de: 'Ich bin dabei 🎉', es: '¡Me apunto! 🎉', id: 'Aku ikut 🎉',
  },
  viewEvent: {
    en: 'View event', vi: 'Xem sự kiện', ko: '이벤트 보기', zh: '查看活动',
    ru: 'Посмотреть событие', fr: "Voir l'événement", ja: 'イベントを見る', ms: 'Lihat acara',
    th: 'ดูกิจกรรม', de: 'Event ansehen', es: 'Ver evento', id: 'Lihat acara',
  },
};

function audienceInvitationTemplate(payload: AudienceInvitationPayload): TemplateResult {
  const locale: Locale = AUDIENCE_LOCALE_TAG[payload.locale] ? payload.locale : 'en';
  const localeTag = AUDIENCE_LOCALE_TAG[locale];
  const eventUrl = `${getBaseUrl()}/events/${payload.eventSlug}`;
  const rsvpUrl = `${getBaseUrl()}/invite/${payload.token}`;

  const eventDate = new Date(payload.startsAt);
  const formattedDate = eventDate.toLocaleDateString(localeTag, {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Ho_Chi_Minh',
  });
  const formattedTime = eventDate.toLocaleTimeString(localeTag, {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Ho_Chi_Minh',
  });

  const title = audienceStrings.title[locale](payload.inviterName, payload.eventTitle);
  const logistics = `📅 ${formattedDate} · ${formattedTime}${payload.locationName ? ` · 📍 ${payload.locationName}` : ''}`;
  // Personal note is deliberately untranslated — a human note in the sender's own words is the point.
  const emailBody = payload.personalNote
    ? `${logistics}\n\n💬 "${payload.personalNote}" — ${payload.inviterName}`
    : logistics;

  return {
    inApp: {
      title,
      body: logistics,
      primaryActionUrl: eventUrl,
      primaryActionLabel: audienceStrings.viewEvent[locale],
    },
    push: {
      title,
      body: logistics,
      primaryActionUrl: eventUrl,
      tag: `audience-invite-${payload.eventSlug}`,
      requireInteraction: true,
    },
    email: {
      subject: `${title} ${getRandomSubjectEmoji()}`,
      title,
      body: emailBody,
      // One-tap token RSVP — the whole point: no login wall for dormant users
      primaryActionUrl: rsvpUrl,
      primaryActionLabel: audienceStrings.imIn[locale],
      secondaryActionUrl: eventUrl,
      secondaryActionLabel: audienceStrings.viewEvent[locale],
    },
  };
}
```

- [ ] **Step 3: Wire the switch**

In `getNotificationTemplate` (line ~1141), after the `user_invitation` case:

```ts
    case 'audience_invitation':
      return audienceInvitationTemplate(payload);
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit 2>&1 | grep templates | head`
Expected: no output. (The email `body` renders `\n\n` inside HTML — acceptable; the default HTML generator puts body in a `<p>`; if you want the note on its own line, replace `\n\n` with a plain sentence separator `— ` instead. Keep it simple; don't build custom HTML.)

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/templates.ts
git commit -m "feat(notifications): audience invitation template — all 12 locales, one-tap token RSVP CTA"
```

### Task 8: Audience resolver

**Files:**
- Create: `lib/audiences/resolve.ts`
- Test: `lib/audiences/resolve.test.ts`

- [ ] **Step 1: Write the failing test (pure functions only — DB functions get smoke-tested)**

```ts
// lib/audiences/resolve.test.ts
import { describe, it, expect } from 'vitest';
import { isValidAudienceKey, subtractExclusions } from './resolve';

describe('isValidAudienceKey', () => {
  it('accepts all and real tags', () => {
    expect(isValidAudienceKey('all')).toBe(true);
    expect(isValidAudienceKey('games')).toBe(true);
    expect(isValidAudienceKey('pickleball')).toBe(true);
  });
  it('rejects unknown keys', () => {
    expect(isValidAudienceKey('everyone')).toBe(false);
    expect(isValidAudienceKey('')).toBe(false);
    expect(isValidAudienceKey('drop table')).toBe(false);
  });
});

describe('subtractExclusions', () => {
  it('removes excluded ids and dedupes', () => {
    const members = ['a', 'b', 'b', 'c', 'd'];
    const excluded = new Set(['b', 'd']);
    expect(subtractExclusions(members, excluded)).toEqual(['a', 'c']);
  });
  it('returns empty when all excluded', () => {
    expect(subtractExclusions(['a'], new Set(['a']))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/audiences/resolve.test.ts`
Expected: FAIL — cannot resolve `./resolve`

- [ ] **Step 3: Write the implementation**

```ts
// lib/audiences/resolve.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENT_TAGS, type EventTag } from '@/lib/constants/event-tags';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

/** Tag audiences look at RSVPs within this window — "actually plays games", not "clicked interested once in January" */
const TAG_WINDOW_DAYS = 120;
/** A user receives at most one audience blast per this window (notification-fatigue guard) */
export const BLAST_COOLDOWN_DAYS = 30;

export type AudienceKey = 'all' | EventTag;

export function isValidAudienceKey(key: string): key is AudienceKey {
  return key === 'all' || (EVENT_TAGS as readonly string[]).includes(key);
}

export function subtractExclusions(memberIds: string[], excluded: Set<string>): string[] {
  return [...new Set(memberIds)].filter((id) => !excluded.has(id));
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Resolve an audience key to member user ids (no exclusions applied).
 * Throws on query errors — callers surface them; no silent [].
 */
export async function resolveAudienceMembers(
  admin: AnySupabaseClient,
  key: AudienceKey
): Promise<string[]> {
  if (key === 'all') {
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq('is_ghost', false);
    if (error) throw new Error(`resolveAudienceMembers(all): ${error.message}`);
    return (data ?? []).map((r: { id: string }) => r.id);
  }

  // Users who RSVP'd going/interested to events carrying this tag, recently
  const { data, error } = await admin
    .from('rsvps')
    .select('user_id, events!inner(id)')
    .in('status', ['going', 'interested'])
    .gte('created_at', daysAgoIso(TAG_WINDOW_DAYS))
    .contains('events.ai_tags', [key]);
  if (error) throw new Error(`resolveAudienceMembers(${key}): ${error.message}`);
  return [...new Set((data ?? []).map((r: { user_id: string }) => r.user_id))];
}

/**
 * User ids that must NOT receive this blast:
 * already invited to the event, already RSVP'd, the sender,
 * anyone blasted in the last 30 days, anyone who muted audience blasts entirely.
 */
export async function getBlastExclusions(
  admin: AnySupabaseClient,
  eventId: string,
  senderId: string
): Promise<Set<string>> {
  const [invited, rsvped, recentlyBlasted, prefs] = await Promise.all([
    admin
      .from('event_invitations')
      .select('claimed_by')
      .eq('event_id', eventId)
      .not('claimed_by', 'is', null),
    admin.from('rsvps').select('user_id').eq('event_id', eventId),
    admin
      .from('event_invitations')
      .select('claimed_by')
      .not('audience', 'is', null)
      .not('claimed_by', 'is', null)
      .gte('created_at', daysAgoIso(BLAST_COOLDOWN_DAYS)),
    admin
      .from('notification_preferences')
      .select('user_id, channel_preferences'),
  ]);

  for (const q of [invited, rsvped, recentlyBlasted, prefs]) {
    if (q.error) throw new Error(`getBlastExclusions: ${q.error.message}`);
  }

  const excluded = new Set<string>([senderId]);
  for (const r of invited.data ?? []) if (r.claimed_by) excluded.add(r.claimed_by);
  for (const r of rsvped.data ?? []) excluded.add(r.user_id);
  for (const r of recentlyBlasted.data ?? []) if (r.claimed_by) excluded.add(r.claimed_by);
  for (const r of prefs.data ?? []) {
    const chans = (r.channel_preferences as Record<string, string[]> | null)?.audience_invitation;
    if (Array.isArray(chans) && chans.length === 0) excluded.add(r.user_id);
  }
  return excluded;
}

/**
 * Distinct-user counts per tag over the window, plus 'all'.
 * One query for all tags — aggregate in JS (fine at this scale).
 */
export async function getAudienceCounts(
  admin: AnySupabaseClient
): Promise<Array<{ key: AudienceKey; count: number }>> {
  const [allMembers, tagRows] = await Promise.all([
    resolveAudienceMembers(admin, 'all'),
    admin
      .from('rsvps')
      .select('user_id, events!inner(ai_tags)')
      .in('status', ['going', 'interested'])
      .gte('created_at', daysAgoIso(TAG_WINDOW_DAYS)),
  ]);
  if (tagRows.error) throw new Error(`getAudienceCounts: ${tagRows.error.message}`);

  const perTag = new Map<string, Set<string>>();
  for (const row of tagRows.data ?? []) {
    const tags = (row.events as unknown as { ai_tags: string[] | null })?.ai_tags ?? [];
    for (const tag of tags) {
      if (!(EVENT_TAGS as readonly string[]).includes(tag)) continue;
      if (!perTag.has(tag)) perTag.set(tag, new Set());
      perTag.get(tag)!.add(row.user_id);
    }
  }

  const result: Array<{ key: AudienceKey; count: number }> = [
    { key: 'all', count: allMembers.length },
  ];
  for (const [tag, users] of perTag) {
    if (users.size > 0) result.push({ key: tag as EventTag, count: users.size });
  }
  // Biggest audiences first (after 'all')
  result.sort((a, b) => (a.key === 'all' ? -1 : b.key === 'all' ? 1 : b.count - a.count));
  return result;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/audiences/resolve.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add lib/audiences/resolve.ts lib/audiences/resolve.test.ts
git commit -m "feat(audiences): resolver — @all/@tag members, blast exclusions, counts"
```

### Task 9: Inngest fan-out function

**Files:**
- Create: `lib/inngest/functions/audience-blast.ts`
- Modify: `lib/inngest/index.ts`
- Modify: `app/api/inngest/route.ts`

- [ ] **Step 1: Write the function**

```ts
// lib/inngest/functions/audience-blast.ts
import { inngest } from '../client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { notify } from '@/lib/notifications';
import type { Locale } from '@/lib/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

function createServiceClient(): AnySupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

export interface AudienceBlastEventData {
  eventId: string;
  invitationIds: string[];
  inviterName: string;
  personalNote?: string | null;
}

/**
 * Fan out an admin audience blast (@all / @games).
 *
 * Idempotency contract (do not weaken):
 * - each recipient is its own step.run, keyed by invitation id — Inngest memoizes
 *   completed steps, so retries never re-notify already-sent users
 * - inside the step, status !== 'pending' → skip (belt and suspenders)
 * - a per-user failure returns 'failed' instead of throwing, so one bad recipient
 *   can't kill the rest of the blast
 *
 * Resend free tier is ~100 emails/day: after AUDIENCE_BLAST_DAILY_EMAIL_CAP emails
 * the run sleeps 24h and continues. Upgrade Resend → raise the env var.
 */
export const audienceBlast = inngest.createFunction(
  { id: 'audience-blast', concurrency: { limit: 1 } },
  { event: 'invitations/audience.blast' },
  async ({ event, step }) => {
    const { eventId, invitationIds, inviterName, personalNote } =
      event.data as AudienceBlastEventData;

    const details = await step.run('fetch-event', async () => {
      const admin = createServiceClient();
      if (!admin) throw new Error('Service client not configured');
      const { data, error } = await admin
        .from('events')
        .select('id, slug, title, starts_at, location_name')
        .eq('id', eventId)
        .single();
      if (error || !data) throw new Error(`Event ${eventId} not found: ${error?.message}`);
      return data;
    });

    const EMAILS_PER_DAY = Number(process.env.AUDIENCE_BLAST_DAILY_EMAIL_CAP ?? 90);
    let emailsToday = 0;
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const invitationId of invitationIds) {
      if (emailsToday >= EMAILS_PER_DAY) {
        await step.sleep(`resend-daily-cap-${invitationId}`, '24h');
        emailsToday = 0;
      }

      const outcome = await step.run(`send-${invitationId}`, async () => {
        const admin = createServiceClient();
        if (!admin) throw new Error('Service client not configured');

        const { data: inv } = await admin
          .from('event_invitations')
          .select('id, status, claimed_by, token')
          .eq('id', invitationId)
          .single();
        if (!inv || inv.status !== 'pending' || !inv.claimed_by) return 'skipped';

        const { data: profile } = await admin
          .from('profiles')
          .select('locale')
          .eq('id', inv.claimed_by)
          .single();

        try {
          const result = await notify({
            type: 'audience_invitation',
            userId: inv.claimed_by,
            locale: ((profile?.locale as Locale) || 'en'),
            eventId: details.id,
            eventSlug: details.slug,
            eventTitle: details.title,
            startsAt: details.starts_at,
            locationName: details.location_name,
            inviterName,
            token: inv.token,
            personalNote: personalNote ?? null,
          });

          if (!result.success) {
            console.error(`[audience-blast] all channels failed for invitation ${invitationId}`);
            return 'failed';
          }

          await admin
            .from('event_invitations')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', invitationId);

          const emailOk = result.channels.some((c) => c.channel === 'email' && c.success);
          return emailOk ? 'sent-with-email' : 'sent';
        } catch (err) {
          console.error(`[audience-blast] invitation ${invitationId} failed:`, err);
          return 'failed';
        }
      });

      if (outcome === 'skipped') skipped++;
      else if (outcome === 'failed') failed++;
      else {
        sent++;
        if (outcome === 'sent-with-email') emailsToday++;
      }

      // Gentle throttle (Resend rate limit is ~2 req/s; also spaces out push)
      await step.sleep(`throttle-${invitationId}`, '1s');
    }

    return { total: invitationIds.length, sent, skipped, failed };
  }
);
```

- [ ] **Step 2: Register the function**

`lib/inngest/index.ts` — add:
```ts
export { audienceBlast } from './functions/audience-blast';
```

`app/api/inngest/route.ts` — add `audienceBlast` to the import from `@/lib/inngest` and to the `functions: [...]` array.

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit 2>&1 | grep -E "inngest" | head`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add lib/inngest/functions/audience-blast.ts lib/inngest/index.ts app/api/inngest/route.ts
git commit -m "feat(inngest): idempotent audience blast fan-out — per-user steps, daily email cap"
```

### Task 10: API — accept `audiences[]` in the invitations route

**Files:**
- Modify: `app/api/events/[slug]/invitations/route.ts`

- [ ] **Step 1: Extend the request handling**

Top of file, add imports:

```ts
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { inngest } from '@/lib/inngest';
import {
  isValidAudienceKey,
  resolveAudienceMembers,
  getBlastExclusions,
  subtractExclusions,
} from '@/lib/audiences/resolve';
```

Extend the interface:

```ts
interface InviteRequest {
  emails?: Array<{ email: string; name?: string }>;
  users?: Array<{ userId: string; username: string }>;
  /** Admin-only: audience keys ('all' or an EventTag). Each member gets a real invitation. */
  audiences?: string[];
  /** Optional human note rendered in the blast email (untranslated on purpose). */
  personalNote?: string;
}
```

Change the empty-body guard (line ~38) to account for audiences:

```ts
  const { emails = [], users = [], audiences = [], personalNote } = body;

  const totalInvites = emails.length + users.length;
  if (totalInvites === 0 && audiences.length === 0) {
    return NextResponse.json({ error: 'emails, users, or audiences array required' }, { status: 400 });
  }
```

Keep the existing quota check but only run it when `totalInvites > 0` (audience path is admin-only; admins are unlimited in `check_invite_quota` anyway):

```ts
  if (totalInvites > 0) {
    const { data: quotaCheck } = await supabase.rpc('check_invite_quota', {
      p_user_id: user.id,
      p_count: totalInvites,
    }) as { data: InviteQuotaCheck | null };

    if (!quotaCheck?.allowed) {
      // ... existing 429 return unchanged ...
    }
  }
```

- [ ] **Step 2: Add the audience block**

The existing inviter-profile query (line ~59) selects `display_name, username, locale` — extend it to also select `role`:

```ts
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, username, locale, role')
    .eq('id', user.id)
    .single();
```

After the existing email + user loops complete (after the `increment_invite_quota` block, before the final `return NextResponse.json`), insert:

```ts
  // ---- Audience blasts (@all / @games) — admin only ----
  let audienceQueued = 0;
  if (audiences.length > 0) {
    if (profile?.role !== 'admin' && profile?.role !== 'superadmin') {
      return NextResponse.json({ error: 'Not authorized for audience invites' }, { status: 403 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Server not configured for audience invites' }, { status: 500 });
    }
    const admin = createServiceRoleClient(url, serviceKey);

    const invalid = audiences.filter((a) => !isValidAudienceKey(a));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Unknown audience: ${invalid.join(', ')}` }, { status: 400 });
    }

    try {
      const excluded = await getBlastExclusions(admin, event.id, user.id);

      // Resolve every audience; first audience to claim a user wins (for the analytics column)
      const memberAudience = new Map<string, string>();
      for (const key of audiences) {
        const members = subtractExclusions(
          await resolveAudienceMembers(admin, key),
          excluded
        );
        for (const userId of members) {
          if (!memberAudience.has(userId)) memberAudience.set(userId, key);
        }
      }

      if (memberAudience.size > 0) {
        const rows = [...memberAudience.entries()].map(([userId, audienceKey]) => ({
          event_id: event.id,
          invited_by: user.id,
          email: `user-${userId}@dalat.app`,
          name: null,
          status: 'pending',
          claimed_by: userId,
          audience: audienceKey,
        }));

        // ON CONFLICT DO NOTHING — never re-notify an already-invited user
        const { data: inserted, error: insertError } = await admin
          .from('event_invitations')
          .upsert(rows, { onConflict: 'event_id,email', ignoreDuplicates: true })
          .select('id');

        if (insertError) {
          console.error('[invitations] audience batch insert failed:', insertError);
          return NextResponse.json({ error: 'Failed to create audience invitations' }, { status: 500 });
        }

        if (inserted && inserted.length > 0) {
          await inngest.send({
            name: 'invitations/audience.blast',
            data: {
              eventId: event.id,
              invitationIds: inserted.map((r: { id: string }) => r.id),
              inviterName,
              personalNote: personalNote?.trim() || null,
            },
          });
          audienceQueued = inserted.length;
        }
      }
    } catch (err) {
      console.error('[invitations] audience resolution failed:', err);
      return NextResponse.json({ error: 'Failed to resolve audience' }, { status: 500 });
    }
  }
```

And extend the final response:

```ts
  return NextResponse.json({
    success: true,
    results,
    sent: successCount,
    failed: results.length - successCount,
    queued: audienceQueued,
  });
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit 2>&1 | grep "invitations/route" | head`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "app/api/events/[slug]/invitations/route.ts"
git commit -m "feat(invitations): audiences[] support — admin-gated, excluded users filtered, Inngest fan-out"
```

---

## Phase 2 — UI

### Task 11: Audience counts endpoint

**Files:**
- Create: `app/api/audiences/route.ts`

- [ ] **Step 1: Write the route** (mirrors the admin gate in `app/api/users/search/route.ts`)

```ts
// app/api/audiences/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { getAudienceCounts } from '@/lib/audiences/resolve';

// GET /api/audiences — pinned audience options for the invite modal (admin only)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin' && profile?.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  try {
    const audiences = await getAudienceCounts(createServiceRoleClient(url, serviceKey));
    return NextResponse.json({ audiences });
  } catch (err) {
    console.error('[audiences] count failed:', err);
    return NextResponse.json({ error: 'Failed to load audiences' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify compile + commit**

Run: `npx tsc --noEmit 2>&1 | grep "api/audiences" | head` → no output.

```bash
git add app/api/audiences/route.ts
git commit -m "feat(api): audience counts endpoint for invite modal (admin only)"
```

### Task 12: i18n keys — ALL 12 locale files

**Files:**
- Modify: `messages/en.json`, `messages/vi.json`, `messages/ko.json`, `messages/zh.json`, `messages/ru.json`, `messages/fr.json`, `messages/ja.json`, `messages/ms.json`, `messages/th.json`, `messages/de.json`, `messages/es.json`, `messages/id.json`

⚠️ Other sessions have uncommitted changes to these files in the MAIN checkout — you are in the worktree, which is clean. Edit only the worktree copies.

- [ ] **Step 1: Add 4 keys to the `invite` namespace in every file**

Keys (English values):
```json
"audienceEveryone": "Everyone",
"audiencePeople": "{count} people",
"personalNoteLabel": "Add a personal note",
"personalNotePlaceholder": "Why should they come? (optional)"
```

Translations per file (add inside the existing `"invite": { ... }` object of each):

- `vi.json`: `"audienceEveryone": "Tất cả mọi người", "audiencePeople": "{count} người", "personalNoteLabel": "Thêm lời nhắn cá nhân", "personalNotePlaceholder": "Vì sao họ nên tham gia? (không bắt buộc)"`
- `ko.json`: `"audienceEveryone": "모든 사용자", "audiencePeople": "{count}명", "personalNoteLabel": "개인 메시지 추가", "personalNotePlaceholder": "왜 와야 할까요? (선택 사항)"`
- `zh.json`: `"audienceEveryone": "所有人", "audiencePeople": "{count} 人", "personalNoteLabel": "添加个人留言", "personalNotePlaceholder": "为什么值得参加？（可选）"`
- `ru.json`: `"audienceEveryone": "Все пользователи", "audiencePeople": "{count} чел.", "personalNoteLabel": "Добавить личное сообщение", "personalNotePlaceholder": "Почему стоит прийти? (необязательно)"`
- `fr.json`: `"audienceEveryone": "Tout le monde", "audiencePeople": "{count} personnes", "personalNoteLabel": "Ajouter un mot personnel", "personalNotePlaceholder": "Pourquoi venir ? (facultatif)"`
- `ja.json`: `"audienceEveryone": "全員", "audiencePeople": "{count}人", "personalNoteLabel": "メッセージを追加", "personalNotePlaceholder": "参加すべき理由は？（任意）"`
- `ms.json`: `"audienceEveryone": "Semua orang", "audiencePeople": "{count} orang", "personalNoteLabel": "Tambah nota peribadi", "personalNotePlaceholder": "Kenapa mereka patut datang? (pilihan)"`
- `th.json`: `"audienceEveryone": "ทุกคน", "audiencePeople": "{count} คน", "personalNoteLabel": "เพิ่มข้อความส่วนตัว", "personalNotePlaceholder": "ทำไมถึงควรมา? (ไม่บังคับ)"`
- `de.json`: `"audienceEveryone": "Alle", "audiencePeople": "{count} Personen", "personalNoteLabel": "Persönliche Nachricht hinzufügen", "personalNotePlaceholder": "Warum sollten sie kommen? (optional)"`
- `es.json`: `"audienceEveryone": "Todos", "audiencePeople": "{count} personas", "personalNoteLabel": "Añadir una nota personal", "personalNotePlaceholder": "¿Por qué deberían venir? (opcional)"`
- `id.json`: `"audienceEveryone": "Semua orang", "audiencePeople": "{count} orang", "personalNoteLabel": "Tambahkan catatan pribadi", "personalNotePlaceholder": "Kenapa mereka harus datang? (opsional)"`

- [ ] **Step 2: Validate JSON**

Run: `for f in messages/*.json; python3 -c "import json; json.load(open('$f'))" || echo "BROKEN: $f"; end`
(fish syntax; in bash: `for f in messages/*.json; do python3 -m json.tool "$f" > /dev/null || echo "BROKEN: $f"; done`)
Expected: no BROKEN output. Then verify all 12 have the keys:
`grep -l audienceEveryone messages/*.json | wc -l` → `12`

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/vi.json messages/ko.json messages/zh.json messages/ru.json messages/fr.json messages/ja.json messages/ms.json messages/th.json messages/de.json messages/es.json messages/id.json
git commit -m "i18n: audience mention + personal note keys — all 12 locales"
```

### Task 13: Invite modal — audience chips + personal note

**Files:**
- Modify: `components/events/invite-modal.tsx`

- [ ] **Step 1: Props + state + types**

Add to `InviteModalProps`:
```ts
  /** Viewer has admin/superadmin role — unlocks @all / @tag audience mentions */
  isAdmin?: boolean;
```

Extend the `Invitee` union:
```ts
type Invitee =
  | { type: "email"; email: string; name?: string }
  | { type: "user"; user: UserSearchResult }
  | { type: "audience"; key: string; count: number };
```

New state + fetch (inside the component, near the user-search state):
```ts
  interface AudienceOption { key: string; count: number }
  const [audienceOptions, setAudienceOptions] = useState<AudienceOption[]>([]);
  const [personalNote, setPersonalNote] = useState("");

  // Load audience options once per open (admins only)
  useEffect(() => {
    if (!open || !isAdmin) return;
    let cancelled = false;
    fetch("/api/audiences")
      .then((r) => (r.ok ? r.json() : { audiences: [] }))
      .then((data) => {
        if (!cancelled) setAudienceOptions(data.audiences || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, isAdmin]);
```

Matching helper (below `inputMode`):
```ts
  // Audience matches for the current input: "@" lists all, "@ga" filters
  const audienceQuery = inputValue.startsWith("@") ? inputValue.slice(1).toLowerCase() : null;
  const audienceMatches =
    isAdmin && audienceQuery !== null
      ? audienceOptions.filter(
          (a) =>
            a.key.startsWith(audienceQuery) &&
            !invitees.some((inv) => inv.type === "audience" && inv.key === a.key)
        )
      : [];
```

- [ ] **Step 2: Selection + dropdown rendering**

Add an `addAudience` callback (next to `addUser`):
```ts
  const addAudience = useCallback((option: AudienceOption) => {
    setInvitees((prev) =>
      prev.some((inv) => inv.type === "audience" && inv.key === option.key)
        ? prev
        : [...prev, { type: "audience", key: option.key, count: option.count }]
    );
    setInputValue("");
    setShowDropdown(false);
    setUserResults([]);
    setError(null);
    inputRef.current?.focus();
  }, []);
```

Dropdown: render audience rows PINNED ABOVE user results. The combined selectable list is `[...audienceMatches, ...userResults]` — update keyboard nav bounds and Enter handling accordingly:

In `handleKeyDown`, replace the dropdown block's list length and Enter behavior:
```ts
    const combinedLength = audienceMatches.length + userResults.length;
    if ((showDropdown || audienceMatches.length > 0) && combinedLength > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, combinedLength - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex < audienceMatches.length) {
          addAudience(audienceMatches[selectedIndex]);
        } else {
          addUser(userResults[selectedIndex - audienceMatches.length]);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }
    }
```

In the JSX dropdown (currently gated on `showDropdown && userResults.length > 0`), change the gate to `(audienceMatches.length > 0 || (showDropdown && userResults.length > 0))` and render audience rows first:

```tsx
{(audienceMatches.length > 0 || (showDropdown && userResults.length > 0)) && (
  <div
    ref={dropdownRef}
    className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg overflow-hidden"
  >
    {audienceMatches.map((option, index) => (
      <button
        key={`audience-${option.key}`}
        type="button"
        className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent transition-colors ${
          index === selectedIndex ? "bg-accent" : ""
        }`}
        onClick={() => addAudience(option)}
        onMouseEnter={() => setSelectedIndex(index)}
      >
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Megaphone className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            @{option.key === "all" ? t("audienceEveryone").toLowerCase() : option.key}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            {t("audiencePeople", { count: option.count })}
          </p>
        </div>
      </button>
    ))}
    {showDropdown &&
      userResults.map((user, index) => (
        /* existing user row JSX, but selectedIndex comparisons and
           onMouseEnter use (index + audienceMatches.length) */
      ))}
  </div>
)}
```

(Import `Megaphone` from `lucide-react` alongside the existing icons. `@all` chip label uses `t("audienceEveryone")` — for tags, `@games` stays raw: tag keys are the taxonomy vocabulary, same as the tag pills elsewhere.)

Audience CHIP rendering — add a branch in the invitee chips map:
```tsx
{inv.type === "audience" ? (
  <span className="flex items-center gap-1">
    <Megaphone className="w-3.5 h-3.5" />
    <span className="font-medium">
      @{inv.key === "all" ? t("audienceEveryone").toLowerCase() : inv.key}
    </span>
    <span className="text-xs text-muted-foreground">
      {t("audiencePeople", { count: inv.count })}
    </span>
  </span>
) : /* existing user/email branches */}
```
Give audience chips the primary style (same classes as user chips). Chip `key`: `inv.type === "audience" ? \`aud-${inv.key}\` : ...`.

- [ ] **Step 3: Personal note + send**

Personal note (render between the chips and the error message, only when an audience chip exists):
```tsx
{invitees.some((inv) => inv.type === "audience") && (
  <div className="space-y-2">
    <Label className="text-sm font-medium">{t("personalNoteLabel")}</Label>
    <AIEnhanceTextarea
      value={personalNote}
      onChange={setPersonalNote}
      context="a short personal invitation note for a community event"
      placeholder={t("personalNotePlaceholder")}
      rows={2}
    />
  </div>
)}
```
Import: `import { AIEnhanceTextarea } from "@/components/ui/ai-enhance-textarea";`

In `handleSendInvites`, add audiences to the POST body:
```ts
      const audienceInvitees = finalInvitees
        .filter((inv): inv is Invitee & { type: "audience" } => inv.type === "audience");

      const response = await fetch(`/api/events/${eventSlug}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: emailInvitees,
          users: userInvitees,
          audiences: audienceInvitees.map((a) => a.key),
          personalNote: personalNote.trim() || undefined,
        }),
      });
```

Success handling: treat `data.queued > 0` like successes — after the existing `sentSuccessfully` computation:
```ts
      const totalSuccess = sentSuccessfully + (data.queued || 0);
      if (totalSuccess > 0) {
        setSending(false);
        setOpen(false);
        setShowCelebration(true);
        setCelebrationCount(totalSuccess);
        return;
      }
```
Add `const [celebrationCount, setCelebrationCount] = useState(0);` and use `celebrationCount` for `<InviteCelebration successCount={...}>` (falling back to `successCount` if 0). Clear audience chips on success (they're not in `failedEmails`/`failedUserIds` — extend the post-send filter to drop audience invitees unconditionally on success).

Send button reach count — replace `count: invitees.length`:
```ts
const totalReach = invitees.reduce((sum, inv) => sum + (inv.type === "audience" ? inv.count : 1), 0);
// ...
{t("sendInvites", { count: totalReach })}
```
Also `removeInvitee` works as-is (index-based).

Reset `personalNote` and `setCelebrationCount(0)` in `handleOpenChange`'s close branch.

- [ ] **Step 4: iOS input-zoom check**

`AIEnhanceTextarea` must render ≥16px font on mobile — check the component's base class; if it inherits the shared `Textarea` (which uses `text-base` = 16px on mobile per shadcn default), fine. If it's `text-sm`, add `className="text-base"`.

- [ ] **Step 5: Verify compile**

Run: `npx tsc --noEmit 2>&1 | grep invite-modal | head`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add components/events/invite-modal.tsx
git commit -m "feat(invite): @all/@tag audience mentions in invite modal — admin only, reach count, personal note"
```

### Task 14: Event page passes `isAdmin`

**Files:**
- Modify: `app/[locale]/events/[slug]/page.tsx:906`

- [ ] **Step 1: Pass the existing flag**

The page already computes `isAdmin` at line ~838 (`hasRoleLevel(currentUserRole, "admin")`). Pass it through:

```tsx
              <InviteModal
                eventSlug={event.slug}
                eventTitle={event.title}
                eventDescription={event.description}
                startsAt={event.starts_at}
                isAdmin={isAdmin}
              />
```

- [ ] **Step 2: Verify compile + commit**

Run: `npx tsc --noEmit 2>&1 | grep "events/\[slug\]/page" | head` → no output.

```bash
git add "app/[locale]/events/[slug]/page.tsx"
git commit -m "feat(events): pass isAdmin to InviteModal for audience mentions"
```

---

## Verification & ship

### Task 15: Full gauntlet

- [ ] **Step 1: Unit tests** — `npx vitest run` → all pass
- [ ] **Step 2: Build** — `npm run build` → success (also runs prebuild checks)
- [ ] **Step 3: Lint** — `npm run lint` → clean for touched files
- [ ] **Step 4: i18n check** — `grep -c audienceEveryone messages/*.json` → every file = 1; run the repo's i18n checker if present (`node scripts/check-client-namespaces.mjs` runs in prebuild)
- [ ] **Step 5: Code review + silent-failure hunt** — run the code-review skill on the branch diff
- [ ] **Step 6: Manual smoke (dev)** — `npm run dev` (port 3001 if 3000 taken), as admin open an event → Invite Guests → type `@` → audience rows appear with counts → select `@all` → note field appears → send → API returns `queued`; check Inngest dev/logs for the blast run; verify an `event_invitations` row flips to `sent` and the email (Resend logs) contains `/invite/<token>` + unsubscribe footer; click unsubscribe link → confirmation page → `notification_preferences` row written.

### Task 16: Ship (Sacred Stops apply)

- [ ] **Step 1: CONFIRM WITH YAN (Tier A):** applying `20260806_001_audience_invitations.sql` to prod
- [ ] **Step 2: Ask Yan: Resend upgrade** (~$20/mo) or keep 90/day cap (blast spreads over 2 days)
- [ ] **Step 3:** `git fetch origin main && git rebase origin/main && npm run build`
- [ ] **Step 4:** `git push origin HEAD:main` (only after Yan's go)
- [ ] **Step 5:** Apply + verify migration per repo protocol (`scripts/supabase-run-sql.sh`, then check `schema_migrations`)
- [ ] **Step 6:** Post-Deploy Summary + prod smoke: send a `@games` blast to a real small audience with Yan watching
- [ ] **Step 7:** Clean up worktree

**Deferred (Phase 3, explicitly out of scope):** Zalo share on token landing page, moment photo in email, per-blast analytics view, `viewed_at` tracking pixel.
