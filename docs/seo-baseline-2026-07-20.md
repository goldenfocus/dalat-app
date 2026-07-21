# SEO Baseline — captured 2026-07-20 (pre-Phase-0)

Snapshot of production discoverability BEFORE the Phase 0 crawlability overhaul
shipped. Every number below is a before/after anchor — re-measure against this
after the fixes land.

## Live prod measurements (curl, 2026-07-20 ~23:00 EDT)

### robots.txt
- AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Claude-Web, ChatGPT-User,
  Google-Extended, GoogleOther, cohere-ai, anthropic-ai, Applebot-Extended):
  `disallow: /` with allowlist `[/blog/, /events/, /about, /faq, /contact]`.
  The allowlist paths are **unprefixed** while 11 of 12 locales serve under
  `/{locale}/...` — net effect: AI crawlers blocked from ~the entire site.
- Cloudflare is NOT edge-blocking AI bots (ClaudeBot UA → HTTP 200 on
  `/events/upcoming`), so robots.txt was the only (self-inflicted) blocker.

### sitemap.xml — 108,840 total `<url>` entries
| Section | Count | Note |
|---|---|---|
| `/download/` track pages | 95,904 (88%) | nested-loop bug emitted tracks² entries |
| `/en/*` URLs | 9,069 | ALL 307-redirect (localePrefix 'as-needed') |
| lyrics | 2,232 | |
| karaoke | 2,232 | |
| blog | 3,888 | |
| moments | 2,256 | listed at legacy redirecting URL shape |
| **actual event detail pages** | **0** | query filtered on dropped column `events.date` → error swallowed by `?? []` |
| tribes | 0 | never included |
| static "event" pages | 48 | `/events/{new,upcoming,this-week,this-month}` × 12 locales (incl. the creation form) |

- Every URL emitted 12× (one per locale) instead of 1 entry + hreflang alternates.
- `lastModified: new Date()` on every static entry every build (dishonest lastmod).

### Canonicals
- Event detail pages: `generateMetadata` returned no `alternates` → inherited
  the locale layout's canonical = the locale **homepage**. (Verified in source:
  `canonicalUrl` was built but only used in `openGraph.url`.)
- Event moments galleries: same inheritance bug.
- Tribe pages: no alternates, no sitemap presence, no noindex gating.
- All canonical/hreflang URLs locale-prefixed for `en` → 307 redirects.

### Database truth (anon-key PostgREST probes)
- Events visible to anon (= crawlers): **168** (all `status=published`)
- Published moments: **2,393**
- Discoverable tribes (`access_type in (public,request) AND is_listed`): **9**
- `moment_metadata` rows: **0** (of 2,466 moments) — AI vision pipeline has
  never executed in prod (Inngest transport never ran)

### Indexing infrastructure
- IndexNow: none (no key file, no pings)
- GSC/Bing Webmaster API baselines: not captured this session (no API access
  wired) — capture indexed-page count + "Duplicate, Google chose different
  canonical" count manually before comparing.

## The 10-probe citation test (to re-run monthly)
Ask ChatGPT / Perplexity / Google AI mode, record whether dalat.app is cited:
1. "things to do in Da Lat this weekend"
2. "Da Lat events tonight"
3. "live music in Da Lat"
4. "best cafes in Da Lat for working"
5. "Da Lat night market events"
6. "달랏 이번 주말 뭐하지" (ko)
7. "大叻周末活动" (zh)
8. "sự kiện Đà Lạt cuối tuần này" (vi)
9. "Da Lat festivals 2026"
10. "where to meet people in Da Lat"

Assumed baseline 2026-07-20: 0/10 (site was robots-blocked to AI crawlers).

## What Phase 0 changed (shipped with this doc)
robots.ts allow-by-default for all crawlers (locale-aware disallows) ·
canonical + 12-locale hreflang on events/galleries/tribes/moments (en at root,
no redirecting URLs) · sitemap: 1 entry/URL + hreflang alternates, all
published events incl. past, tribes added, canonical moment URLs, downloads
removed, honest lastmod, query errors throw · IndexNow key + pings on event
publish/update and path revalidation · prebuild ratchets:
`check-canonicals.mjs`, `check-robots-ai.mjs`.
