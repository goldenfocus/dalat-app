# Blog and News authority audit — 2026-08-27

## Outcome

DaLat.app already has a crawlable, multilingual Blog/News footprint worth
protecting. The repair strategy is to correct and enrich established article
rows in place. An article URL that has ever been public is treated as a durable
asset; automation must preserve its `blog_posts.id`, category, slug, original
publication time, likes, and translation identity.

This audit does **not** claim that every existing URL has backlinks or search
traffic. It establishes a public, crawlable footprint, with published URLs in
the sitemap and directly resolvable experimental News URLs, that is capable of
carrying search and AI-discovery equity.

## Reproduced production accuracy failure

On 2026-08-28 in Đà Lạt, the newest live automated story was:

- DaLat.app URL: `/blog/news/sunny-sky-homestay-da-lat`
- cited source: Thanh Niên, published 2026-04-13
- source subject: **Tháng Năm homestay** and the April 30–May 1 holiday

The generated page renamed the property “Sunny Sky Homestay,” changed the
holiday to Tet, added summer framing, predicted future popularity, and supplied
owner quotations that do not appear in the cited article. The page was valid
SSR HTML with a canonical URL, `NewsArticle` schema, image, and visible source
link—good discovery mechanics wrapped around unsupported claims.

## Inventory snapshot

Read-only database and sitemap inspection found:

- 479 Blog posts: 342 published, 111 experimental, 26 draft
- 318 posts labeled `news_scrape`
- 229 posts in the News category: 209 with one source, 20 with two
- 89 published `news_scrape` guides/stories with no source URL
- 111 experimental News posts publicly readable and indexable
- no stored source tier or claim-level provenance on the legacy records
- 342 Blog article URLs in the regular sitemap and 118 in the News sitemap

## Root causes

1. The legacy Blog Autopilot performs no source discovery or fetching. It asks
   a model for a fresh local or SEO topic and publishes the generated answer.
2. The newer News pipeline sends truncated raw articles straight to a rewrite
   prompt. There is no claim extraction, evidence match, conflict check, or
   structured fact ledger.
3. The rewrite prompt asks for insider local context, named places, community
   framing, and quotations. Those instructions invite unsupported detail.
4. The publication score measures polish: length, headings, bold text, local
   vocabulary, images, and attribution phrases. It does not measure source
   authority, corroboration, extraction support, freshness, or agreement.
5. A rediscovered source URL is skipped forever, while a matching topic is
   marked processed without refreshing the established article.
6. Published slugs and categories are editable. Archiving makes a previously
   public URL disappear, and slug collisions create timestamp-suffixed pages.
7. Source publication time and DaLat.app publication time are conflated; a
   health job can also make old backlog content look newly published.
8. English canonicals, JSON-LD, feeds, and some sitemap links disagree about
   whether `/en` belongs in the URL.

## Durable URL policy

- Correct facts, sources, title, body, imagery, and metadata on the existing row.
- Never change category or slug after `published_at` is set.
- Preserve the original `published_at`; corrections advance `updated_at`.
- A known source URL updates its mapped `blog_post_id`. A mere topic/fingerprint
  match is held for editorial review instead of overwriting either established
  URL.
- Do not create a timestamp-suffixed URL when canonical identity is ambiguous.
- Do not archive or delete an ever-public URL without a direct permanent
  redirect to a clearly superior replacement. Legal/privacy removal is the
  explicit exception.
- A category-mismatch request permanently redirects to the current canonical
  category path; it must not remain a 200 duplicate.

## Phase 1 architecture

```text
discover and fetch sources
  -> extract claims with short, exact evidence fragments
  -> reject claims whose evidence is absent from the named source
  -> reject conflicts and unsafe relative dates
  -> build a normalized fact ledger with source tier and timestamps
  -> score authority, corroboration, support, freshness, and agreement
  -> render fixed fact labels plus accepted values (no model-authored prose)
  -> reject unsupported quotes, relative dates, and numbers
  -> insert a new draft/published row OR update the established row in place
```

One Tier A primary source can be sufficient. A single Tier B newsroom source
stays below automatic publication; corroboration requires distinct publishers,
not merely two URLs. New content below 0.85 stays draft. If an established URL
is already public but cannot yet clear the gate, it remains reachable as
`experimental` so its URL equity is not destroyed, while it is excluded from
high-confidence feeds and the Google News sitemap until verified.

Corrections use a deterministic fingerprint of accepted fact key/value pairs.
An unchanged fingerprint refreshes current provenance and confidence without
rewriting edited prose, metadata, images, or translations. A changed (or
legacy-missing) fingerprint regenerates the established row and invalidates
only automatic translations. Rejected sources are removed from the public
provenance envelope rather than being presented as freshly verified.

The model is now confined to proposing claim candidates. Publishable title,
body, metadata, and topic are rendered from a closed fact-key vocabulary and
the accepted values byte-for-byte. This intentionally produces concise fact
briefs in Phase 1: it closes the ordinary-language loophole where a rewrite
could invent a cancellation, cause, intention, amenity, popularity claim, or
local context without adding a suspicious name, number, date, or quotation.
Richer prose should be introduced only through reviewed templates for specific
fact keys.

Exact value inclusion is not enough: every rendered fact key also needs an
explicit field-specific cue in the short source fragment. Negated, denied,
uncertain, alleged, and historical relationships are rejected rather than
being inverted by a fixed label. Direct quotes require real source quote
delimiters. This guard is deliberately fail-closed and supports both common
English and Vietnamese evidence wording.

The scraper also rotates through five older linked source URLs every 30 days.
It fetches only the exact registered publisher origin, preserves the last good
snapshot on failure, and requeues successful refreshes with the same
`blog_post_id`. A redirect or declared canonical that changes the persisted
article path is rejected; publisher search and home pages cannot be parsed as a
replacement article merely because they return long HTML.

Before discovering new stories, each scrape run also audits legacy public
automation whose raw-source identity link is missing. It can recover a tightly
bounded batch of exact URLs from registered publishers and attach the refreshed
raw article to the existing `blog_post_id`; it never creates a replacement
public URL. Source-free posts and URLs from publishers that are not explicitly
registered remain visible editorial-audit work instead of receiving invented
or guessed provenance.

Recovery inventory is paginated in stable ID order and each run is capped at
three posts, six source URLs, and a 60-second start budget. A failed fetch is
persisted as a linked verification failure, so one dead publisher URL cannot
consume the first slot forever. In-flight claims use a unique lease token with
compare-and-set ownership checks; generic health retries cannot promote an
unfinished placeholder into publishable input. Source URLs claimed by multiple
public posts are quarantined for manual resolution.

The processor now leases pending raw rows atomically and every later state
transition checks the run owner. It also builds a paginated exact-source index
from established automated posts before any public write. Together these
guards prevent overlapping cron/manual runs or an interrupted raw-link write
from minting a second URL for the same known source. A future normalized source
identity table is still needed to collapse tracking/canonical URL variants and
to transact semantic identity across different source URLs.

Automatic translation jobs carry the exact factual revision and field text.
The worker checks that revision immediately before and after each write, inserts
missing rows without replacing a concurrent human edit, and updates only an
exact previously observed `auto` row. Corrections commit the source row before
invalidating automatic translations. Admin saves await the same invalidation
endpoint; for automated news it advances `content_updated_at` in the source
envelope before returning success. Public detail, Blog, News, trending, and
load-more reads all apply that cutoff, so a late translation of pre-correction
prose cannot become visible. Older reviewed/edited rows stay human-owned but are
hidden pending review rather than overwritten or endlessly requeued.

Crawler freshness uses the newest factual-envelope or live-row timestamp, so a
source reverification or editorial correction advances feed and sitemap
`lastmod` even when the accepted fact fingerprint is unchanged. The factual
translation cutoff remains separate so provenance-only refreshes do not force
all 12 locales to rebuild.

Production inspection found that the detail RPC resolves experimental News
URLs, while the list RPC's invoker RLS omits them and the detail predicate does
not cover legacy automation in other categories. They remain out of the
high-confidence News list, but constrained server-only detail and sitemap reads
include only `source = news_scrape AND status = experimental`, preserving every
established category URL. Drafts and manual experimental posts remain private.

Article pages now put original publisher links and checked dates next to the
reporting, show a visible updated date for factual revisions, permanently
redirect category-path mismatches, and emit canonical/schema/feed URLs without
the redirecting default `/en` prefix. The regular sitemap retains established
automation in its real category; the Google News sitemap is limited to verified
published stories from the last two days. News is also present in the desktop
and mobile primary navigation. A richer homepage module, multi-image layouts,
and the full content-quality dashboard remain later-phase product work.

## Existing-content cleanup order

1. Source and reverify the 89 public source-free posts on their current URLs;
   this cannot be made truthful automatically without real evidence.
2. Automatically recover registered legacy source links, then audit remaining
   unregistered publisher URLs on their existing pages.
3. Reverify the 209 single-source News pages, prioritizing dates, schedules,
   prices, addresses, opening hours, names, and quotations.
4. Correct and enrich each established row in place.
5. Consolidate true duplicates with explicit permanent redirects.
6. Remove only pages that cannot be made truthful or useful, with a legal or
   user-safety reason and an intentional HTTP/redirect outcome.

## Later schema work requiring a migration

The JSON provenance envelope is a safe first step, but durable enforcement
eventually needs normalized source, claim, revision, correction, and URL-alias
tables; a database trigger that freezes public slugs/categories; and explicit
`first_published_at`, `last_verified_at`, `verification_status`, `stale_after`,
and source-content hashes. It should also make source-edit plus translation
invalidation a single database transaction; the current admin flow waits for
both server operations and fails closed on errors, but cannot make two existing
tables atomic without that schema/RPC work. That migration is intentionally
outside this no-migration Phase 1 change.
