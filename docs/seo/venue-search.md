# Venue search and AI discovery

Goal: make the canonical Dalat.app venue page the most useful, trustworthy answer to a venue or Đà Lạt planning query. Technical eligibility is a prerequisite; no release may claim rankings or AI citations from a successful crawl alone.

## Release contract

- Preserve official venue names, existing slugs, redirects and backlinks. Improve indexed URLs in place.
- Render factual descriptions, location, known hours, menu/prices, upcoming activities and relevant photos in the initial server HTML. Do not put essential information only in client scripts or image text.
- One stable `https://dalat.app/{slug}#place` identity connects the 12 language pages. Each WebPage uses its own self-canonical URL, language and visible description. Menu and breadcrumb URLs must resolve to their real routes.
- Schema must match visible, sourced facts. Never invent ratings, reviews, free admission, coordinates, hours, Wi-Fi speeds, first-person visits or rankings. Google ratings may be displayed with attribution; do not relabel third-party reviews as Dalat.app aggregate ratings.
- A missing primary-description translation is `noindex,follow`, absent from hreflang and the venue sitemap. The source language remains indexable. When translation arrives, readiness automatically restores the localized canonical; its sitemap lastmod reflects the actual translation update. Pages with no description contain no fallback prose claim.
- Keep search crawlers able to fetch rendering resources and public venue photo endpoints. Private API/admin/auth routes remain excluded. Never bypass security globally or trust a spoofed user-agent as a verified crawler.
- Use the translation release contract in AGENTS.md for every new visible or metadata field. Do not generate English SEO filler over short translations.

## Repeatable delivery audit

Run from the app checkout with existing public Supabase environment configuration:

```sh
node scripts/seo/audit-venues.mjs --slug=social-house-dalat --locales=all
node scripts/seo/audit-venues.mjs --all --locales=all --out=/tmp/dalat-venue-seo/full.json
```

The default samples three public venues in English/German. The full audit checks Googlebot, OAI-SearchBot, Claude-SearchBot and PerplexityBot user agents, HTTP status, canonical, index readiness, server-visible prose, place identity, localized WebPage and breadcrumbs. It uses anonymous RLS and two request lanes. Any failure gives a nonzero exit code. Reports contain public URLs and checks, never credentials.

This audit proves delivery from the auditing machine, not real crawler access or ranking. Also inspect Cloudflare verified-bot/security events and each provider's official IP guidance. An invalid API token is an access blocker to that evidence, not evidence that bots are allowed or blocked.

## Content advantage over an owner's social page

Prioritize owner-confirmed, fresh information that answers real decisions: menu and prices, full opening/closed days, precise directions, accessibility facts, upcoming events, recurring activities, and attributed authentic community photos. Add original venue-specific reporting or helpful answers only when evidence supports them. Owner submissions and corrections should feed this same canonical page, with source and verification provenance retained.

Connect each venue to relevant city/category guides, its organizer, recurring series and individual events using descriptive crawlable links. Keep category guides curated and useful; do not create empty keyword combinations, copied social feeds, fabricated FAQs, doorway pages, paid-link schemes or an indiscriminate AI article flood. A bilingual or multilingual page must add usable access, not merely multiply URLs.

## Measure outcomes

1. In the verified Google Search Console property, capture a dated 28-day baseline of venue URLs, queries, country, language/device, impressions, clicks, CTR and position. Inspect representative canonical and localized URLs for index status, selected canonical, sitemap discovery and last crawl.
2. Track brand queries (official name plus Dalat/Đà Lạt), category/intent queries (for example a café with language exchange), and their real target-language equivalents. Compare the same windows after releases. Do not label a web-search sample as a Google rank report.
3. Track actual ChatGPT, Claude and Perplexity referral visits and a fixed set of dated, locale-specific answer checks. Record the prompt, whether search was enabled, cited URL and substantive answer accuracy. An answer without a Dalat.app citation is not a citation win. Training-crawler permission is independent of search inclusion.
4. Review coverage, indexing and freshness before adding more content. Fix pages with impressions but weak usefulness/CTR; expand verified venue information where queries expose a genuine gap.

Search Console/property access and Cloudflare credentials must be verified live before claiming those measurements or edge settings were checked. Nothing here promises first place, immediate indexing, or displacement of a venue's official site.

## Official guidance

- [Google AI features and your site](https://developers.google.com/search/docs/appearance/ai-features): standard SEO remains applicable; special AI text files/schema are not required.
- [Google helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google LocalBusiness structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [OpenAI crawlers](https://developers.openai.com/api/docs/bots): OAI-SearchBot controls ChatGPT search inclusion independently of GPTBot training.
- [Anthropic crawlers](https://privacy.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
- [Perplexity crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)
