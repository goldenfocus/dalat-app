# Phuong collaboration workshop — 2026-09-10

## Portrait and name update

The hero now pairs the original user-provided portrait of Phương (the clearer September 10 attachment) with Zan’s provided forest portrait. The CSS landscape and coordinates are removed. Images use responsive Next Image rendering; no generated or retouched portrait is used. The earlier chat screenshot is not published. Display names use Phương across EN/VI/FR; URL slugs remain ASCII. French copy is now fully available at /fr through next-intl. Existing owner values Thu and Phuong migrate to Phương without changing freeform notes. Service worker: 1.0.21.

## Subdomain move

The current URL is https://phuong.dalat.app (Vietnamese: /vi), attached to the same Vercel project. Host middleware rewrites locale roots to app/[locale]/collaborate/phuong and sends ordinary public-page links to dalat.app. Cloudflare DNS uses Vercel’s recommended DNS-only CNAME. No separate app or Worker is deployed. Both the host and internal route carry noindex headers. This remains unlisted, not access-controlled.

The /thu workshop route is removed without a redirect, and migration 20260910_002 releases only its workshop reservation after deployment. The existing /phuong profile is untouched. Personal mentions use Phuong in EN/VI; Vietnamese “Thu phí” (charge fees) remains unchanged. The old localStorage key is retained and old owner labels migrate, but browser storage cannot automatically cross domains. Existing notes on dalat.app are not deleted or transmitted. Service worker version: 1.0.20.

## Original implementation record

## Inspection and scope

- Worktree started from origin/main (65dd0a5a), preserving the older local main's divergence and unrelated files.
- Next.js 16 App Router, React 19, next-intl 4, Tailwind and Radix UI. Existing system fonts, semantic theme tokens and Pine & Mist palette are retained.
- `app/[locale]` supplies the site header, footer, theme provider and progressive client dictionaries. English uses an unprefixed canonical URL; Vietnamese uses `/vi`.
- Supabase provides authentication, profiles, events, RSVP/check-in, organizer/venue records and unified slugs. Existing Moments routes support event galleries and professional uploads. R2/Cloudflare media infrastructure is already present. No gallery, payment, messaging or CRM system is added here.
- Live homepage and a bounded public Supabase lookup confirmed the September 8 AI Skill Share event slug. No person/profile identity was inferred from a similar name. Public slug lookup returned `found: false` for `thu`.
- Admin layouts have role gates, but those do not provide a simple shared meeting invitation. This canvas is intentionally unlisted and accessible by link, not authenticated.
- The sitemap enumerates its own public routes/entities; no workshop entry is added. Metadata and response headers mark every localized workshop route noindex/nofollow. Referrer policy prevents outgoing links carrying the meeting URL.
- Production is Vercel via push to main. `wrangler.jsonc` explicitly prohibits attaching production routes. No subdomain or Cloudflare change.

## Implementation

Route-scoped EN/VI JSON is loaded through the existing next-intl request configuration and passed from the server to the workshop. Other locale routes use English with a matching content `lang`. It is not added to the core client namespace payload.

Role choices, autonomy level and seven decision fields use a versioned browser-local record. Storage is validated, bounded and resilient to malformed data. No notes are submitted to a server. Notes persist across EN/VI; downloaded text is a user-triggered local export. Dates use explicit Đà Lạt time for the check-in. The owner is deliberately one accountable person, with decision rights recorded separately.

The locale-mismatch banner is suppressed only on `/thu`, where deliberate bilingual switching is part of the meeting. Global navigation and other pages retain existing behavior.

A small data-only SQL migration reserves `thu` through the existing `reserved_slugs` mechanism. It refuses to proceed if a profile, organizer, venue or unified slug already owns the route. No schema or policy changes. Apply with the repository's `scripts/supabase-run-sql.sh`; do not run a broad migration push against divergent history.

The service worker release advances 1.0.18 → 1.0.19 per README. Its existing allowlist does not cache `/thu` HTML.

## Strategic choices

- Use existing photos and organizer tools as evidence, not proof of adoption.
- Treat photo-driven return and all network loops as hypotheses.
- Start with three organizer conversations and one attempted independent publishing handoff. A validated draft is a fallback, not equivalent to successful adoption.
- Count Zan's setup/rescue time as well as routine supervision. Agree scope, compensation and decision rights before starting paid work.
- Internal events test delivery; external organizer behavior tests demand. Do not infer repeat rate from a seven-day window.
- Optional services are a more plausible early revenue hypothesis than selling audience reach. Track margin after founder time.
- The idea garden is explicitly not a roadmap. No role, salary, equity or future position is promised.

## Meeting and privacy checks

Check the actual date/deadline and device timezone before the meeting. Review Vietnamese phrasing together. Use a separate agreed private contact sheet. Anyone with the URL can read the strategy; noindex is not access control. Browser-local notes are accessible to other people using that browser and are not encrypted or synchronized. Download the decision and clear the meeting on shared devices.

## QA

Production build and TypeScript passed. Full Vitest run: 103 files, 666 tests passed; two additional component tests passed afterward (including malformed-storage, bilingual round-trip, translation-coverage, reset and blocked-storage tests). Full lint: zero errors, 484 existing warnings. Focused changed-file lint is checked separately. Browser QA covers EN/VI, 390px mobile and desktop, light/dark, role selection, persistence on reload/language change, navigation targets and notes export/reset. Final production verification is recorded in the delivery receipt.

## Account-private conversation answers (2026-09-10)

The six conversation prompts now use `workshop-answers.tsx` and the non-cacheable
`/api/workshop-answers` endpoint. Existing Dalat.app authentication runs on the
workshop host, including onboarding; its existing Supabase redirect allowlist
already includes `https://*.dalat.app/**`. Cookies are not copied across domains.

Migration `20260910_003_workshop_answers.sql` stores one response per question and
user. RLS restricts all reads/writes to the author. The server derives the author
from the authenticated session and rejects stale account context. No public
comments, notifications, automated translation or service-role reads are used.
Participants' usernames have not yet been confirmed: responses are author-private,
not shared between Zan and Phương. Any future sharing must explicitly authorize
both accounts and add narrowly scoped policies; knowing this page's URL grants no
access to answers. Site/database operators retain their normal infrastructure access.

Save is explicit, supports editing/clearing, and persists across devices. Unsaved
text stays in memory and navigation warns before leaving. Existing role selections
and decision fields still use browser-local storage. EN/VI/FR include the answer UI.

Validation: API/UI tests cover anonymous access, author spoofing, stale sessions,
input validation, save behavior and errors. A transaction against production
verified RLS read isolation, forged-author denial and own updates, then rolled
back all probe content. Actual OAuth/email login should be checked by each user.
