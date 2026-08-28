# Đà Lạt Activity Graph: source, discovery, and compliance strategy

**Status:** implementation contract  
**Checked:** 2026-08-27  
**Scope:** source acquisition, provenance, compliance, geography, publishing gates, and operating cost

## 1. Product contract

ĐàLạt.app is not an event scraper. It is a **Đà Lạt activity graph** whose job is to answer “What should I do today?” with useful, current, attributable options.

An event is only one graph shape. The graph must also represent:

- **ActivitySeries** — a recurring concept such as a weekly yoga class or nightly acoustic set.
- **Occurrence** — one dated or timed instance of a series.
- **OngoingWindow** — an exhibition, festival, or seasonal activity available across a date range.
- **BookableExperience** — a workshop, tour, retreat, or class with availability rather than one fixed event.
- **OpenSession** — a recurring public practice, meal, service, club, or meetup.
- **Screening** — a film or performance showing whose schedule changes frequently.
- **Place**, **Organizer**, **Offer**, and **AudiencePolicy** — the entities needed to decide whether an activity is nearby, public, suitable, and actionable.
- **SourceObservation** — a versioned claim from one source at one time. An observation is evidence, not an activity by itself.

Core graph edges include organizer → runs → series, series → has → occurrence, occurrence → happens_at → place, observation → supports → field, source → published_by → organization, and occurrence → supersedes/cancels → occurrence.

Promotional media is also source-scoped, not event-approved. Parsers may retain
officially advertised image URLs as private `reference_only` evidence, but the
public projection must use ĐàLạt.app fact-art until the source registry records
a media reuse grant. A single licensed source policy can then unlock future
posters automatically; no event-by-event human approval step is introduced.

**Decision:** persist recurring series separately from occurrences. Never generate an indefinite set of future events from “every Friday.” Materialize only the current planning horizon, retain the recurrence rule, and reverify the canonical source before extending it.

**Decision:** every published field that can change — time, place, price, booking URL, cancellation, public access — must be traceable to a current observation.

### Evidence labels used in this document

- **Validated now** means the cited first-party page, official policy, provider price, or existing repository behavior was inspected on 2026-08-27. It does not imply a parser has been production-tested unless stated.
- **Pilot assumption** means a number or operating rule chosen for measurement. It must be replaced with observed data.
- **Decision** means a product or engineering boundary to implement.

## 2. Existing foundation and what changes

**Validated now:** the repository contained an older scheduled Vercel → Supabase
queue → Mac mini importer. Its execution patterns—atomic claims, canaries, and
health checks—were useful research, but its event output defaulted to drafts for
human review. That background lane and the legacy Apify event webhook are
retired in this MVP. They must not be re-enabled or pointed at real activity
sources unless their output first enters Activity Graph evidence, locality,
duplicate, public-access, and freshness gates.

This strategy changes the acquisition model:

- Replace “scrape as many events as possible” with “maintain approved, attributable activity sources.”
- Replace “zero cost” with **zero marginal model cost while existing subscription capacity lasts**. That capacity is useful but is not an SLA and is not unbounded.
- Treat old Apify/Facebook ideas as superseded. Social platforms are opt-in or officially authorized inputs, not crawl targets.
- Treat search results as leads to candidate first-party sources, never as event facts.
- Keep historical legacy drafts invisible; they are not an approval backlog and
  are never promoted automatically by Activity Graph.

The earlier pipeline documents remain useful for job execution and health behavior, but their source and legal assumptions are superseded by this document.

## 3. Ranked source hierarchy

Trust, permission, and freshness are separate dimensions. A government page may be authoritative but geographically irrelevant; a venue page may be fresh but omit whether a session is public. Rank does not remove field-level publishing gates.

| Rank     | Source class                                                                    | Preferred access                                                      | Normal publishing posture                                                                                                         | Why it matters                                                            |
| -------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 0        | Owner-connected organizer or venue                                              | Webhook, ICS/RSS, owner API, organizer portal, verified email/forward | Auto-publish eligible after identity and schema verification                                                                      | Fastest corrections, cancellations, and recurring schedules               |
| 1        | Canonical first-party activity page                                             | Public ICS/RSS/JSON-LD/HTML; conditional GET                          | Auto-publish eligible for sourced facts when geography and public access pass                                                     | Best practical source for local recurring activities                      |
| 2        | Official civic, cultural, university, and institutional calendar                | Public API/feed/HTML/PDF                                              | Auto-publish eligible only when the item is public and inside the service geofence                                                | High authority; often broad in geography or intended audience             |
| 3        | Licensed ticketing, cinema, and experience API                                  | Documented API/MCP under its terms                                    | Publish only fields and media the license permits                                                                                 | Structured inventory and booking state, but never complete local coverage |
| 4        | Verified community submission                                                   | Submission form, forwarded message, flyer plus source URL             | Auto-publish only when authorization, hard gates, and the calibrated confidence threshold pass; otherwise corroborate or withhold | Captures temple meals, clubs, markets, and informal recurring activities  |
| 5        | Search-discovered lead                                                          | Search API returns a candidate URL/domain                             | Never publish from the snippet; resolve the canonical source and run normal source/record gates                                   | Expands the source graph without treating snippets as truth               |
| Excluded | Unauthorized social scraping, private groups, login/CAPTCHA bypass, hidden APIs | None                                                                  | Never ingest                                                                                                                      | High legal, privacy, reliability, and account-loss risk                   |

Within each rank, prefer structured owner-provided data in this order: webhook → API/ICS/RSS → JSON-LD → stable public HTML → public PDF/image with automated corroboration. Structured data is only a parse format; it is not permission to copy content. Google’s [Event structured-data documentation](https://developers.google.com/search/docs/appearance/structured-data/event) defines a format, not a reuse license.

## 4. Verified current Đà Lạt seed sources

The following are real seed candidates observed on 2026-08-27. “Validated” means the page and its role were inspected, not that broad content or image republication is licensed.

### Ship-first sources

| Source                                                                                                                                                                                                                                               | Activity-graph value                                    | Validated now                                                                                | V1 access and publishing decision                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Lâm Đồng Museum event calendar](https://baotanglamdong.com.vn/events)                                                                                                                                                                               | Exhibitions, cultural programs, museum activities       | Current official event surface; public event paths were allowed by the sampled robots policy | Registry-approved public HTML; facts and links only unless media permission is obtained                                                                         |
| [Đà Lạt tourism portal](https://dalat-info.gov.vn/)                                                                                                                                                                                                  | Official tourism and destination programming            | Current official portal; sampled robots policy did not disallow public pages                 | Discover and poll named public sections; geocode every item because the administrative coverage is wider than Đà Lạt                                            |
| [Vietnam Tourism 2026 event calendar](https://vietnam.travel/event?year=2026)                                                                                                                                                                        | Nationally promoted festivals and major programs        | Current official calendar                                                                    | Low-frequency official feed; use as corroboration and major-event discovery                                                                                     |
| [Official 2026 Đà Lạt Flower Festival plan](https://phuongblao.lamdong.gov.vn/chi-tiet-tin-tuc/?param=da-lat-chuan-bi-to-chuc-festival-hoa-lan-thu-xi-nam-2026-voi-chuoi-hoat-dong-phong-phu-lan-toa-toan-tinh-bec6c84d-4c94-4a13-b566-5fa209ef6eaa) | Festival program and constituent activities             | Current first-party government announcement                                                  | Create one festival series and distinct occurrences only where the source supplies date/place evidence                                                          |
| [LuLuLoLa](https://www.lululola.com.vn/)                                                                                                                                                                                                             | Concerts and recurring acoustic programming             | First-party page currently exposes dated 2026 programs and a recurring acoustic pattern      | Poll schedule pages, not admin or internal API paths; require a fresh observation for each dated show                                                           |
| [Mây Lang Thang](https://maylangthang.com.vn/)                                                                                                                                                                                                       | Live music shows                                        | First-party site currently exposes Đà Lạt shows for 2026                                     | Poll public show pages only; never touch checkout/order paths; facts and canonical booking link only                                                            |
| [Dưới Tán Anh Đào](https://duoitananhdao.com/en/)                                                                                                                                                                                                    | Informal recurring nightlife                            | First-party page currently advertises a nightly acoustic window                              | Model as ActivitySeries + near-term Occurrences; reverify recurrence on a short TTL                                                                             |
| [Sivananda Yoga Vietnam upcoming courses](https://sivanandayogavietnam.org/upcoming-courses)                                                                                                                                                         | Retreats, yoga courses, year-round practice             | First-party dated-course surface is current                                                  | Poll public course pages; distinguish residential retreats from drop-in public sessions                                                                         |
| [Twin Beans coffee workshop](https://twinbeans.vn/en/coffee-workshop/)                                                                                                                                                                               | Daily bookable workshop outside the city center         | First-party page currently states a daily session and price                                  | Model as BookableExperience; robots policy was not discoverable in the sample, so keep the source disabled until its source-level permission record is resolved |
| [Diocese of Đà Lạt Mass schedules](https://giaophandalat.com/gioi-thieu/gio-le)                                                                                                                                                                      | Recurring services, including public-language schedules | First-party schedule was updated in late 2025                                                | Model as OpenSession, not an entertainment event; preserve respectful labeling and reverify recurrence                                                          |
| [Yersin University event calendar](https://yersin.edu.vn/su-kien/)                                                                                                                                                                                   | Talks, workshops, campus cultural programs              | Current first-party event surface; public event paths were allowed by sampled robots policy  | public_access defaults to unknown; never auto-publish internal/student-only items                                                                               |
| [UAH DDAA 2026](https://www.uah.edu.vn/festival-thiet-ke-va-nghe-thuat-nam-2026-dalat-design-art-atelier-2026-ddaa-2026)                                                                                                                             | Design and art festival                                 | Current official university festival page                                                    | Ingest named public program items; preserve the university as publisher and organizer provenance                                                                |
| [Cinestar showtimes](https://cinestar.com.vn/lichchie/)                                                                                                                                                                                              | High-frequency cinema screenings                        | Current first-party showtime surface exists                                                  | Pilot transport/rendering first; short TTL, exact cinema location, and no poster reuse without permission                                                       |
| [Dalat Ultra Trail 2026](https://vietnammtbseries.com/vi/event/dalat-ultra-trail-2026)                                                                                                                                                               | Major outdoor sports occurrence                         | Current organizer event page                                                                 | One organizer source; publish exact race dates and booking state only while current                                                                             |

### Licensed/API pilots

- **Ticketbox:** [official read-only MCP documentation](https://mcp.ticketbox.vn/) and [terms](https://mcp.ticketbox.vn/terms) are live. The documented MCP supports event search and details without consumer authentication. **Validated now:** documentation and terms. **Not validated:** our direct transport probe returned HTTP 403, and useful Đà Lạt inventory has not been measured. Register as a disabled licensed-API pilot, not a dependency and not an HTML crawl target.
- **Viator:** the [Partner API](https://docs.viator.com/partner-api/) can supply bookable experiences. Its [technical guide](https://partnerresources.viator.com/travel-commerce/technical-guide/) recommends incremental modified-since retrieval. Contract, display, retention, and attribution requirements control use.
- **GetYourGuide:** use only through the documented [Partner API](https://code.getyourguide.com/partner-api-spec/).
- **Klook:** access begins through its [partner program](https://www.klook.com/en-GB/partner/). Treat availability and commercial terms as contract-specific.

These marketplace sources complement the graph. They do not prove that a local activity does not exist.

### Explicit hold

[Ticketgo’s customer terms](https://ticketgo.vn/page/chinh-sach-dieu-khoan-su-dung-cho-khach-hang) prohibit commercial use without written permission. Its robots file may permit public crawling, but **robots permission is not a content license**. Do not ingest Ticketgo beyond linking a manually submitted canonical URL until written permission is recorded.

## 5. Source registry compliance contract

No fetch job may be scheduled from an arbitrary URL. Every source endpoint must have an approved registry record, and policy evaluation must fail closed.

### Required source fields

| Group      | Required fields                                                                                                                                | Implementation meaning                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Identity   | source_id, name, canonical_base_url, publisher_org, owner_contact, source_class, locale, timezone, activity_kinds                              | One source means one approved endpoint/feed/page family, not one event and not necessarily one domain                                    |
| Coverage   | coverage_area_hint, geofence_policy, place_ids, public_access_default                                                                          | Hints guide resolution; they never replace per-record geocoding                                                                          |
| Access     | access_mode, endpoint, auth_type, secret_ref, request_method, parser_kind                                                                      | access_mode is one of webhook, api, ics, rss, jsonld, html, pdf, submission, search_lead                                                 |
| Permission | permission_basis, terms_url, terms_checked_at, terms_version_hash, robots_url, robots_checked_at, allowed_paths, forbidden_paths, contract_ref | permission_basis is one of owned, explicit_contract, documented_api_terms, public_facts_only, user_submission                            |
| Reuse      | facts_reuse_allowed, full_text_reuse_allowed, media_reuse_allowed, attribution_text, canonical_link_required, raw_retention_days               | Default full text and media to false. Store facts, a short original summary, attribution, and the canonical link                         |
| Privacy    | personal_data_allowed, private_content_allowed, consent_ref, data_residency_notes                                                              | Both booleans default false. Public contact details are not activity content                                                             |
| Fetch      | poll_interval_minutes, rate_limit_per_minute, max_concurrency, conditional_get, user_agent, timeout_ms, max_bytes, backoff_policy              | Per-source controls; honor Retry-After and stop on repeated authorization failures                                                       |
| Trust      | trust_tier, auto_publish_eligible, requires_corroboration, expected_yield, freshness_sla_minutes                                               | Trust is scoped to fields; an organizer can be authoritative about time but not transit distance                                         |
| State      | policy_status, enabled, canary_state, last_success_at, last_changed_at, last_nonempty_at, consecutive_empty_runs, error_rate_7d                | policy_status is pending, approved, suspended, or denied; only approved + enabled schedules work                                         |
| Economics  | expected_fetches_month, expected_ai_jobs_month, license_cost_month, cost_center                                                                | Makes scale and partner costs auditable                                                                                                  |
| Compliance | policy_checked_by, policy_checked_at, policy_check_due_at, takedown_contact, kill_switch_reason                                                | Terms and robots must be rechecked on a schedule and after material responses; this is source-level compliance, never per-event approval |

**Decision:** crawl permission and republication permission must be separate fields. [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) defines robots behavior; it does not grant copyright, database, trademark, privacy, or commercial-reuse rights.

### Required observation/provenance fields

Every retrieved or submitted observation stores:

- observation_id, source_id, source_url, source_native_id, observed_at, fetched_at
- HTTP status, ETag, Last-Modified, raw_hash, content_type, byte_count
- extractor_name, extractor_version, schema_version, locale_detected
- raw_snapshot_ref and raw_expires_at, subject to the source retention rule
- field_evidence: source fragment or structured path for title, dates, recurrence, place, price, booking state, public access, and cancellation
- confidence_by_field, corroborating_observation_ids, last_verified_at, expires_at
- decision_state, withheld_reason, retry_count, and next_corroboration_at

An activity record must not silently overwrite provenance. A changed source creates a new observation; normalization then decides whether it updates an existing series/occurrence or creates a new one.

## 6. Discovery and acquisition policy

### Candidate-to-production flow

1. **Discover a candidate.** Leads may come from owner enrollment, community submission, a known first-party link, official calendars, or a search API.
2. **Create a pending registry record.** No scheduler entry exists yet.
3. **Clear source policy.** Resolve identity, terms, robots, path scope, auth, privacy, media rights, geography, and takedown contact. This can require source-level operations/legal work, but it is never a per-event approval step.
4. **Fetch a bounded sample.** Confirm stable identifiers, real activity yield, public-access signals, and parser behavior.
5. **Run a shadow canary.** Automatically evaluate candidates without publishing until the source demonstrates the required precision, freshness, duplicate, and cost thresholds. There is no item-by-item approval queue.
6. **Approve and enable.** Set the narrowest useful path and least frequent cadence that meets freshness needs.
7. **Continuously re-evaluate.** Suspend immediately on changed terms/robots, 401/403, CAPTCHA/login presentation, repeated parsing ambiguity, or takedown.

### Search is a lead generator

[Brave Search API](https://brave.com/search/api/) is suitable for discovering candidate first-party pages. Search snippets, cached text, and ranking are not activity evidence.

Useful Vietnamese and English query families include:

- Đà Lạt hôm nay, tối nay, cuối tuần, lịch tháng/year
- workshop, acoustic, triển lãm, thiền, yoga, chạy bộ, đạp xe, chợ phiên, lễ hội, tình nguyện
- Da Lat today, tonight, this weekend, exhibition, open studio, coffee workshop, language exchange, hiking group, live music

Queries should include freshness terms and known organizer/place entities. Search expansion runs weekly or monthly, not continuously. A newly discovered domain must complete source-level policy clearance before direct fetching.

### Fetch rules

- Prefer webhooks, feeds, APIs, JSON-LD, and conditional HTTP. Send If-None-Match/If-Modified-Since; hash bodies; extract only when content changes.
- Fetch only registered public paths. Do not probe internal or hidden API routes, checkout/order paths, admin paths, or endpoints disallowed by current robots policy.
- No generic recursive crawler, proxy rotation, account farming, login/CAPTCHA bypass, or private-group automation.
- Respect documented API quotas, Retry-After, and source-specific concurrency. A 403 is a stop signal, not a proxy-rotation trigger.
- Store only the minimum evidence needed. Do not mirror full descriptions, photos, posters, attendee lists, comments, or contact databases without an explicit license.
- The canonical source link and attribution remain visible on every published activity.
- Owner corrections and takedowns outrank automated observations and propagate to all future materialized occurrences.

## 7. Social and messaging platform boundaries

The competitive advantage is an organizer network and verified inbox, not unauthorized surveillance of closed ecosystems.

| Platform       | Official boundary                                                                                                                                                                                                                                            | Allowed graph input                                                                                        | Not allowed                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Facebook Pages | Meta requires app review for public Page content and actively opposes unauthorized scraping: [platform update](https://about.fb.com/news/2018/07/a-platform-update/) and [anti-scraping position](https://about.fb.com/news/2021/04/how-we-combat-scraping/) | Owner-authorized Page integration, organizer-submitted post URL, or first-party site linked from a post    | Broad Page/group scraping, login automation, private groups, copied media/comments |
| Instagram      | The [official Instagram API](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) serves an authorizing professional Business/Creator account                                                                                         | Owner-authorized professional account, organizer submission, canonical first-party link                    | Consumer-account discovery, hashtag/location scraping, copied photos/captions      |
| TikTok         | Display API is for an authorizing creator: [Display API overview](https://developers.tiktok.com/doc/display-api-overview/). The [Research API FAQ](https://developers.tiktok.com/doc/research-api-faq/) excludes commercial users                            | Creator-authorized display data or submitted video URL that enters the normal corroborate-or-withhold path | Commercial use of Research API, broad scraping, copying video                      |
| Zalo           | [Zalo OA authorization](https://stc-developers.zdn.vn/docs/v2/official-account/bat-dau/xac-thuc-va-uy-quyen-cho-ung-dung-new) requires an OA administrator                                                                                                   | Owner-authorized OA ingestion, structured organizer message, submission link                               | Broad OA search/scraping, personal chat ingestion                                  |
| WhatsApp       | [WhatsApp Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api) is business messaging and webhooks                                                                                                    | Messages deliberately sent to the ĐàLạt.app business inbox, with consent and retention policy              | Public/group discovery, private chat harvesting, contact-graph collection          |
| Telegram       | Use is governed by the [Telegram API terms](https://core.telegram.org/api/terms)                                                                                                                                                                             | Owner-added bot in a public organizer channel, direct submission, forwarded public link                    | Private-group access, member harvesting, undisclosed monitoring                    |
| YouTube        | The [YouTube API policy](https://developers.google.com/youtube/terms/developer-policies) prohibits scraping; [quota costs](https://developers.google.com/youtube/v3/determine_quota_cost) apply to official API requests                                     | Official API within quota, owner channel authorization, submitted video URL as a lead                      | Page scraping, downloading/rehosting video, treating a title as confirmed schedule |

For all platforms, capture consent/authorization scope, platform account ID, token expiry, revocation state, and the exact fields allowed. Revocation disables ingestion and initiates retention cleanup.

Vietnam’s [Law on Personal Data Protection 91/2025/QH15](https://vanban.chinhphu.vn/?classid=1&docid=214590&pageid=27160&typegroup=) is effective from 2026-01-01. The graph should avoid personal data by design: no attendee/member graphs, private messages beyond deliberate submissions, inferred sensitive attributes, or retention of unnecessary phone/email data.

## 8. The geographic trap

**Validated now:** the new Lâm Đồng province combines the former Lâm Đồng, Bình Thuận, and Đắk Nông provinces. The arrangement became operational on 2025-07-01; the Government’s [Decision 759 summary](https://xaydungchinhsach.chinhphu.vn/quyet-dinh-so-759-qd-ttg-phe-duyet-de-an-sap-xep-to-chuc-lai-dvhc-cac-cap-va-xay-dung-mo-hinh-to-chuc-chinh-quyen-dia-phuong-2-cap-119250415063742039.htm) and the official [National Assembly resolution PDF](https://congbao.chinhphu.vn/tai-ve-van-ban-so-202-2025-qh15-45050-56708?format=pdf) record the merger.

Therefore “Lâm Đồng,” a lamdong.gov.vn hostname, or an official provincial publisher does **not** mean “in Đà Lạt.” Provincial sources can now include Mũi Né, Phan Thiết, Gia Nghĩa, and other places far outside a useful local feed.

### Geographic implementation rules

- Maintain a versioned product geofence, not a city-name string. Each place resolves to coordinates plus canonical place_id and administrative aliases.
- Classify each occurrence as core, nearby, outside, or unknown. Outside is excluded; unknown cannot auto-publish.
- **Pilot assumption:** start with a manually reviewed Đà Lạt core polygon and a separately labeled nearby ring. Product must choose the ring based on realistic travel time before launch; do not silently fold it into “Đà Lạt.”
- Require exact coordinates or a resolved venue for auto-publication. A provincial label is insufficient.
- Preserve both historical and current Vietnamese administrative names as aliases. Never rewrite the organizer’s displayed venue text without retaining the original.
- Detect multi-location programs and split occurrences by venue.
- Deduplicate by canonical place + normalized series + time window, not by title or province.
- Use [OpenStreetMap under ODbL](https://www.openstreetmap.org/copyright) where suitable, but do not bulk-geocode through the public Nominatim service: its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) limits heavy use and forbids systematic POI extraction. Host it or use a contracted geocoder at scale.
- If Google Places is used for entity resolution, follow its [content and attribution policy](https://developers.google.com/maps/documentation/places/web-service/policies). Place IDs may be retained; other content has caching/display restrictions. [Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search) is entity discovery, not an event feed.

## 9. Automated publishing, withholding, and freshness gates

An occurrence is auto-publish eligible only when all are true:

1. The source is policy-cleared, enabled, and auto-publish eligible.
2. The canonical place resolves inside core or an explicitly labeled nearby zone.
3. Date/time or recurrence is unambiguous in Asia/Ho_Chi_Minh.
4. Public access is explicit or confirmed for that activity class.
5. Required booking, price, age, or capacity qualifiers are preserved.
6. Evidence is within the source-specific freshness SLA.
7. No newer cancellation, postponement, sold-out state, or contradiction exists.
8. Reuse and attribution rules permit every displayed field and asset.
9. Every critical field passes the calibrated confidence threshold for that source class and activity shape.

**Decision:** publishing is automatic. There is no required human approval for an event or activity. Thresholds are calibrated against source fixtures and random post-publication audits; they are not one global model score.

The decision engine has only bounded machine paths:

- **publish** when every hard gate and the calibrated threshold pass;
- **corroborate/retry** when a canonical first-party or authorized source can resolve a missing or conflicting field;
- **withhold** when ambiguity remains after bounded retries, evidence is stale, or any hard gate fails.

A withheld candidate stores a machine-readable reason and next_corroboration_at. It never waits in an approval queue. Search snippets, unresolved OCR-only flyers, social links without authorization, campus events with unknown audience, and ambiguous provincial locations are automatically corroborated or withheld.

**Pilot freshness assumptions:**

| Activity shape                  |                         Recheck target | Expiry behavior                                                              |
| ------------------------------- | -------------------------------------: | ---------------------------------------------------------------------------- |
| Showtime/same-day inventory     |                              2–6 hours | Hide after the observed window or on missing schedule                        |
| Dated occurrence within 7 days  |                             4–12 hours | Mark unverified if the canonical page disappears; do not invent cancellation |
| Dated occurrence beyond 7 days  |                                  Daily | Increase cadence as it approaches                                            |
| Weekly/nightly recurring series |      Every 7 days; materialize 14 days | Stop extending future occurrences when verification expires                  |
| Ongoing exhibition/season       | Daily near start/end, weekly otherwise | Close at sourced end date                                                    |
| Evergreen bookable experience   |                       Every 14–30 days | Keep series, hide booking promise when stale                                 |

Measure source-specific change rates and replace these assumptions after a 30-day pilot.

### Admin and post-publication controls

Admin is an observability and correction surface, not a moderation conveyor belt. It must show source health, evidence, confidence, freshness, automatic decisions, audit failures, complaints, and downstream occurrences.

There must be no approve/publish action whose use is required for normal supply.

Required fast actions are:

- unlist an occurrence or series immediately;
- disable a source and stop future materialization;
- correct a field with author, reason, evidence, and expiry provenance;
- force refetch/corroboration;
- resolve a takedown or rights complaint and run the applicable retention cleanup.

Run a random automated audit over 3% of changed observations in the pilot. The audit reopens canonical evidence and independently checks place, time, public access, contradiction, and attribution. A critical failure automatically unlists the affected occurrence and raises the source error score; repeated failures disable the source. Complaint monitoring follows the same refetch/corroborate/unlist path. Neither audit nor complaint handling adds a pre-publication approval gate.

## 10. Monthly cost model

### What “source” means

One source is one approved endpoint, feed, page family, webhook, or submission channel. It is not one occurrence. Ten thousand source endpoints would be a stress scenario far beyond the likely high-quality local registry; it should not be a growth target.

The current app already pays for platform and model subscriptions. The table below estimates **marginal monthly automation cost**. It excludes existing Vercel/Supabase/model subscription commitments, contract-specific partner fees, and labor unless shown separately.

### Pilot workload assumptions and formulas

| Variable         |                                               Pilot assumption | Formula                                                             |
| ---------------- | -------------------------------------------------------------: | ------------------------------------------------------------------- |
| S                |                                      Approved source endpoints | scenario input                                                      |
| p                |                        Weighted average 1.5 fetches/source/day | mixes fast and slow sources; must be measured                       |
| F                |                                                Monthly fetches | S × 30 × p = 45S                                                    |
| c                |                          10% of fetches return changed content | pilot assumption                                                    |
| C                |                                              Changed documents | F × c = 4.5S                                                        |
| a                |                   30% of changed documents require AI fallback | structured parsers handle the rest                                  |
| J                |                                             AI extraction jobs | C × a = 1.35S                                                       |
| A                |           Random automated audit jobs, 3% of changed documents | C × 0.03 = 0.135S                                                   |
| Token envelope   |                                   8,000 input + 800 output/job | pilot assumption; includes relevant page fragments, not whole sites |
| Search expansion | 10% of registry replaced/explored monthly, 5 queries/candidate | Q = 0.5S Brave queries                                              |
| Raw retention    |                           One 100 KB changed snapshot, 30 days | G = C × 0.0001 GB = 0.00045S GB                                     |

Provider rates were validated on 2026-08-27:

- [Brave Search API](https://brave.com/search/api/): $5 per 1,000 requests and a $5 monthly credit. Search cost = max(0, Q × $0.005 − $5).
- [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini): $0.25/M input tokens and $2/M output tokens, or about $0.0036 for the assumed job.
- [Gemini 2.5 Flash](https://ai.google.dev/gemini-api/docs/pricing): $0.30/M input and $2.50/M output, or about $0.0044 for the assumed job.
- Budget extraction and automated audit calls at **$0.004–$0.022/job**: the low end is one normal call; the high end is a 5× envelope for retries, longer pages, translation, and verification. Existing Mac mini subscription workers can make this marginal line $0 while quotas and reliability suffice.
- [Vercel function invocation billing](https://vercel.com/changelog/function-invocations-now-billed-per-unit) is $0.60/M invocations, so the invocation fee is F × $0.0000006. Runtime/memory/egress vary by implementation; [Vercel’s usage documentation](https://vercel.com/docs/functions/usage-and-pricing) bills those resources separately.
- **Pilot fetch-runtime envelope:** $0.00005–$0.0005/fetch for ordinary conditional HTTP and parsing. This is a planning allowance, not a quoted Vercel unit price. Headless browser work is excluded.
- [Supabase Pro pricing](https://supabase.com/pricing) starts at $25/month and includes 8 GB database size before $0.125/GB overage. With current headroom, incremental storage is $0; otherwise use max(0, current_db_GB + G − 8) × $0.125.

### Scenario results

| Approved sources | Fetches F | Changed C | Extraction jobs J | Audit jobs A | 30-day raw G | Fetch runtime + invocation | Brave after credit | Paid AI, J + A | Marginal automation total | Approval labor |
| ---------------: | --------: | --------: | ----------------: | -----------: | -----------: | -------------------------: | -----------------: | -------------: | ------------------------: | -------------: |
|              100 |     4,500 |       450 |               135 |         13.5 |     0.045 GB |                $0.23–$2.26 |                 $0 |    $0.59–$3.27 |              **$1–$6/mo** |         **$0** |
|            1,000 |    45,000 |     4,500 |             1,350 |          135 |      0.45 GB |               $2.28–$22.53 |                 $0 |   $5.94–$32.67 |             **$9–$56/mo** |         **$0** |
|           10,000 |   450,000 |    45,000 |            13,500 |        1,350 |       4.5 GB |             $22.77–$225.27 |                $20 | $59.40–$326.70 |          **$103–$572/mo** |         **$0** |

Automation totals are rounded up and assume storage remains inside the existing included allowance. If all raw storage were overage, add approximately $0.01, $0.06, or $0.57 respectively. A dedicated new Supabase project adds at least $25/month; add the actual Vercel team plan and any model subscriptions rather than inventing a blended fixed cost.

There is no routine event-approval labor. Exception handling for a genuine complaint or correction is operational support, not a publishing gate. A separate planning formula is:

complaint_operations = complaint_count × 0.25 hours × loaded_hourly_rate

The 15-minute handling time is a pilot assumption. A month with no complaints has $0 complaint-operation cost; measure the real rate and response time without smearing it into per-event review.

### Sensitivity and exclusions

- Fetch cost scales linearly with poll cadence. Four polls/day instead of 1.5 multiplies fetch/runtime cost by 2.67.
- AI cost scales with both change rate and fallback rate. Parsing structured sources first is the highest-leverage cost control.
- The model assumes ordinary HTTP, official APIs, feeds, submissions, and bounded PDFs. Permitted browser-rendered pages can cost 5–20× more and should be separately budgeted.
- Social scraping is intentionally absent; it is not an optional cost tier.
- Partner/API license fees, affiliate economics, SMS/email, map-provider charges, and media licenses are contract-specific and remain $0 only until a signed agreement or bill says otherwise.
- One source can yield thousands of occurrences. Optimize for unique, current activity coverage and trustworthy recurring series, not registry count.

## 11. V1 rollout gates

Start with 25–50 high-yield policy-cleared sources across music, arts, wellness, outdoors, learning, worship/community, markets, cinema, and official programs. Graduate toward 100 only after a 30-day shadow canary proves:

- at least 95% precision on time/place/public-access fields in random automated audit samples;
- cancellation and material schedule changes surface within each source SLA;
- recurring activities do not continue after their verification expires;
- every published item has a reachable canonical source and field evidence;
- outside-geofence leakage is below 1% and never auto-published when location is unknown;
- no source fetch violates its registered path, rate, auth, retention, or reuse rules;
- yield, duplicate rate, stale rate, corroboration attempts, automated-audit failures, complaint rate, and cost per useful published activity are visible per source.

Disable low-yield, high-error, or high-complaint sources. The enduring moat is a dense graph of verified organizers, places, recurring activities, corrections, and local context — not the largest crawler.
