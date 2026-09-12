# ĐàLạt Experience Atlas: voice contribution MVP

**Product date: September 12, 2026. First field test: September 13, 2026.**

Status vocabulary: **Observed** means inspected in this checkout or verified in a test; **decision** describes this implementation; **hypothesis** needs customer evidence; **future** is not a release commitment. Implementation and verification receipts are at the end. This is a product record, not evidence that the founder has already visited or reviewed a restaurant.

## 1. Origin: RedNote and lifestyle search

The founder's study of Xiaohongshu (RedNote / Little Red Book) prompted the concept. People can use visual accounts of real visits to answer practical lifestyle questions about restaurants, travel, products and places. The lesson is a **product hypothesis**, not a claimed market study: a corpus of attributable, specific, recent experiences may be more useful than another generic directory. We should test this locally instead of assuming RedNote's network effects transfer to one city.

## 2. The ChatGPT cannibalization question

Why visit ĐàLạt.app if an assistant can answer the same question? A general answer, an attractive AI-written article, or a generic recommendation is not a durable advantage. If this product merely paraphrases existing web content, the criticism wins. An assistant can also summarize an original account without returning a click. Referral traffic alone is therefore a weak business foundation.

## 3. Conclusion and product promise

ĐàLạt.app should supply original local knowledge and authorized actions to search engines and AI assistants. Its useful assets are identifiable contributors, original photographs, dated observations, relationships among people/venues/dishes/events/activities, corrections, creator collections, and actions such as following, saving, directions, joining and contributing. These become defensible only with density, quality and continuous refresh.

**Live your life, talk about it, and ĐàLạt.app turns it into something useful for you and everyone else.**

The creator promise: **Give ĐàLạt.app your photos and story. It will create something beautiful and useful that you will want to keep and share.** A useful private memory must justify contributing before discovery traffic exists.

## 4. Complete dual-voice vision

**Contribution:** upload original photographs; optionally video; type, record one uninterrupted story, or enter an interview. Media and speech establish what is already known. The first recording creates a useful draft. Ask at most one optional question at a time, such as whether all menu choices were vegetarian or only the dishes ordered. Explain that the user can stop at any point. Stopping preserves the recording; publishing always requires a separate review action.

A mature draft can propose title, narrative, summary, venue, visit date, experience type, categories/tags, dishes/products/activities, supplied prices, time-of-day context, supplied accessibility/noise/Wi-Fi/dietary/atmosphere observations, original language, search metadata, internal/external links, map reference, source-linked claims with confidence, supported translations, and optional future narration/video treatments. Missing information stays missing. These fields are not an interview checklist.

**Discovery:** type, record, or converse: “Somewhere peaceful for a date this afternoon, vegetarian food, and recent positive experiences.” Answers should retrieve the application's own records and cite dated firsthand accounts. Show the contributor, visit date, supporting context, and a route to act. Current event timing and canonical venue identity cannot be inferred from an old review. Discovery voice is **P1**, not shipped here. “Dual voice” describes both product directions; it does not require two concurrent models or connections.

## 5. Entity model and compatibility

**Observed:** Next.js App Router, Supabase authentication/Postgres, next-intl with 12 locales, existing event/venue/Moment/profile/tribe/map/search implementations. English uses unprefixed URLs; other locales are prefixed. Older handover documents describe three locales and are no longer authoritative on locale count.

- **Experience:** durable account of something a contributor did, visited, tasted or observed, with date and authorship. Separate additive table; no existing Moment conversion.
- **Event:** scheduled gathering or announcement. A restaurant visit must not require creating a fictitious event.
- **Venue:** canonical location with coordinates, address and existing event relations. Existing venue search is reused. Canonical venue pages use `/{slug}`; `/venues/{slug}` redirects there. Both render paths are connected. No guessed coordinates.
- **Moment:** existing event-linked media/UGC, including richer existing content types. We do not redefine or migrate existing Moments. Future experiences may reference compatible Moments with explicit reuse permission.
- **Profile:** existing identity owns experiences. Existing follow behavior remains available from the profile.
- **Tribe:** existing privacy/membership space; no automatic cross-posting of private tribe content.
- **Atlas:** the relationships, not a new database product. Maps currently display existing records; new experience map layers are later.

Small schema: `experiences` holds reviewed content/status; `experience_sources` privately holds notes, transcripts, generated suggestions, consumed audio IDs, usage and AI lease; `experience_media` links immutable originals and photo derivatives; `experience_venue_submissions` preserves a contributor-confirmed pending name/address until canonical resolution. Observations are bounded JSON records (subject, value, context, source type, confidence, source excerpt). Original evidence excerpts remain in private generation records; public observations omit those excerpts. Author and visit date come from the owning experience. Expiration/refresh intervals, normalized dishes, conversations, translations, collections and event/Moment join tables are later additions.

Venue selection searches likely existing matches. Contributors can correct the venue and explicitly confirm it. Unresolved names/addresses become pending submissions, never counterfeit verified venues. An operator must eventually reconcile submissions; multiple users can currently submit the same pending identity. This is acceptable for a small pilot, not a finished entity-resolution service.

## 6. Creator value and habit

The initial reward is a well-presented personal memory and a permanent shareable page, not promised reach. Exportable ownership, corrections and unpublishing matter. The habit to prove is **visit → record → keep/share → return after another visit**. A beautiful tool can improve first conversion without producing repeat behavior. Do not build a generalized creator network until return contribution is observed.

## 7. Vibelog and ownership

**Future:** one underlying experience can appear in a creator's global Vibelog journal and in ĐàLạt.app's local view. It should retain one stable ID, primary author, canonical URL, revision ownership and deletion authority. Syndicated presentations should reference the original, not create disconnected social proof. Geography selects the city projection; creator consent controls syndication. There is no Vibelog dependency, account system or network call in this MVP.

## 8. Search and AI distribution

Publish meaningful server-rendered pages containing original narrative/media, author, dates, place, category, description, Open Graph image and truthful Article structured data. Use one canonical per original-language record. Locale UI wrappers do not justify claiming translated articles or creating 12 independent sources of evidence. Only published experiences enter the sitemap. Category filters provide navigation without generating thin keyword pages.

**Observed crawler preference:** `app/robots.ts` has a wildcard allow rule with private/technical exclusions. OAI-SearchBot, GPTBot and other bots inherit it; no explicit model-training exclusion is present. `/api/` is disallowed. Public photo derivatives therefore use `/experience-media/{experience}/{media}`, with the same publication/RLS checks on every request; private audio remains behind authenticated access. Search access and training permission are distinct; this release does not change either preference. `llms.txt`, existing search expansion and venue search were inspected; experience semantic retrieval/MCP are not connected yet.

**Future MCP/API:** search experiences, fetch sources, save a venue, follow a creator, contribute a private draft, or RSVP under the user's existing authorization. Reads must enforce publication/tribe boundaries; writes require account identity and explicit scope. Measure completed account actions, not just outbound clicks. Do not claim that public HTML guarantees assistant citation.

## 9. Trust, provenance, consent and corrections

Firsthand is a contributor's assertion, not independent visit verification. Impressions, owner statements and inferences must remain distinguishable. “Noisy Tuesday evening” cannot become “always noisy.” No invented prices, dietary certifications, opening hours, quotes, access guarantees or reviews. Generated suggestions are schema-validated, anchored claims require source excerpts/photo IDs, and the contributor reviews before publishing. Confidence is a model estimate, not a probability of truth.

Recordings and original transcripts remain private. Reviewed narrative is AI-assisted paraphrase, never presented as a verbatim quote. Contributors confirm media/people permissions and disclose complimentary visits or sponsorship. No recording before microphone consent. The UI discloses sending selected evidence to OpenRouter/provider. Publishing exposes only the reviewed story and selected photo copies; originals remain privately retained. Share copies strip EXIF/GPS. Users must consider visible faces, receipts and identifying details: metadata removal does not redact image content.

Unpublish revokes app access; it cannot retract copies already saved by other people. Delete removes originals and records through authenticated routes. Local recovery is account-scoped IndexedDB on the device, not encryption at rest; shared devices require care. Browser storage eviction remains possible, so the interface warns to keep the page open and upload. Backups/provider retention follow existing service policies; no promise of instant deletion from backups. Do not copy private source snippets into public provenance fields. Optional generated-media reuse is not enabled or implicitly licensed.

Google Maps may identify/link a place. Do not scrape/copy/cache/enhance Google photos, reviews or listing content into permanent Dalat assets. Contributor/venue-supplied data should provide those assets. Any future displayed API material must meet applicable attribution/retention terms. This MVP only links out for directions and reuses existing Dalat venue records.

## 10. Media strategy

P0: original photos, private preservation, bounded JPEG derivatives, truthful alt text/captions, photo selection/removal, cover from selected originals. No generated hero, fabricated crowd removal, enlarged room, invented menu item or synthetic social proof.

Later: audio narration; short narrated or vertical exports; subtitles and translated captions; exposure/color cleanup that preserves facts; disclosed artistic representations; local-model video experiments. Derived translations, narration and clips remain **one source of social proof**. Every generation is optional, separately consented, costed, and off the critical publishing path. A video export should link to the authoritative experience and preserve attribution.

## 11. Revenue possibilities

Hypotheses: paid private journal/export/storage tools; creator tools; clearly labeled venue subscriptions for owner updates and QR contribution invitations; booking/affiliate commissions disclosed on relevant actions; licensed structured access where contributors permit it. Do not sell ranking boosts disguised as evidence, suppress critical experiences for subscribers, or let commissions determine “best” recommendations. Validate creator retention and decision value before implementing billing. Nothing here changes billing or purchases services.

## 12. Red-team register

| Serious risk | Why it matters | Earliest exposing evidence | Cheapest mitigation | Blocks P0? |
|---|---|---|---|---|
| Existing platforms win contribution | Contributors already have audiences and habits | People share on Instagram/TikTok/Maps/RedNote but abandon our draft | Useful private keepsake; one share link; observe 10 users | No; core demand test |
| Beauty does not create a habit | One polished page is not retention | Fewer than four independent return contributors | Ask what they wanted to keep; simplify capture | No; blocks expansion |
| AI answers absorb value | Citations may produce no visits or revenue | Cited answers without actions/returns | Account actions, direct creator relationships, export value | No |
| Cold start | Sparse evidence makes recommendations generic | Search sessions contain no useful recent match | Seed 10 venues through real visits; show coverage gaps | No; discovery P1 |
| Fake experiences/generated proof | Destroys differentiated trust | Reused photos, impossible timelines, repeated templated claims | Identity attribution, originals, manual spot checks, separate verification states | Yes if fabricated content is published as verified |
| Business manipulation/review gaming | Incentives bias evidence | Clusters of one-venue accounts, identical praise, deletion pressure | Sponsorship disclosure, pattern review, no pay-to-rank | No for controlled pilot |
| Stale hours/menu/prices/events | Wrong current advice can ruin a visit | Users report closed venues or changed prices | Dated observations, never convert to current operating facts | No; blocks current-fact assertions |
| Venue duplicates/misresolution | Merges wrong businesses and misleads directions | Users correct matches or duplicate names proliferate | Existing search, explicit confirmation, pending records | No; needs operational reconciliation |
| Synthetic media erodes trust | Generated scenes mimic independent proof | Users cannot tell original from generated | Original photos only in P0; disclose later art | Yes for factual generated imagery |
| Copyright/permissions | Original upload may still lack rights | Complaints from photographers/people shown | Consent attestation, original attribution, removal path | No for consented pilot; disputes need action |
| Recording/face/location privacy | Raw media can disclose private people and habits | Users surprised by public audio/GPS | Private originals/transcript, strip EXIF, explicit review | Yes if private evidence is public |
| AI cost accumulation | Multiple modalities/retries compound | Cost per publish exceeds useful margin | 120s recording, six analysis photos, token/time/attempt limits; no video | No; measure before scaling |
| Latency and mobile failures | A lost recording destroys trust immediately | Refresh/offline/lock loses a recording | IndexedDB chunks, direct upload, explicit retry, upload before AI | Yes if routine failures lose data |
| Provider dependence | Account restrictions/model changes break voice | Model listing/request fails | Explicit configurable model boundary; manual story path; no hidden switch | No for manual release; blocks verified voice claim |
| Moderation/disputes | A founder cannot resolve unlimited allegations | Unanswered complaints or frequent factual disputes | Small pilot, takedown process, retain private provenance | No for private pilot; public scaling gate |
| Thin AI pages/search penalties | Rephrased filler provides no original value | Pages lack real evidence; low indexing/engagement | Original narrative/photos required; no keyword or fake translation expansion | No; publication quality gate |
| Single-city ceiling | Revenue may not support operations | Repeat local utility plateaus below operating cost | Measure city unit economics before expansion | No |
| Excessive breadth | Journal/social/maps/MCP/video obscure one habit | Weeks spent on exports before first real contribution | Contribution P0; freeze discovery/generation scope | Yes if scope delays first visit |
| Monetization corrupts recommendations | Trust conflicts with paying businesses | Paid venues outrank stronger evidence | Separate ads/owner updates; auditable ranking | No; billing not in MVP |

The strongest surviving proposition is an effortless personal memory that also contributes dated evidence. The network, assistant distribution and revenue remain unproven. If users do not return without chasing, more modalities will not repair the central weakness.

## 13. Ranked opportunity multipliers

Scores are qualitative planning judgments: value/defensibility/validation speed are high (H), medium (M), low (L). Cost and operational burden describe implementation plus ongoing work. Rank favors proving a repeat habit.

| Rank | Extension | Value | Defensibility | Speed | Cost / operations | Cheapest validation |
|---|---|---|---|---|---|---|
| 1 | Automatic personal travel diary | H | M | H | L / L | Five people keep a week's visits |
| 2 | Creator collections and living maps | H | H | H | M / L | Share one vegetarian route |
| 3 | Discovery-to-contribution post-visit prompt | H | H | H | L / M | Opt-in prompt after directions |
| 4 | Venue QR contribution invitation | H | M | H | L / M | Two venues; disclose incentives |
| 5 | Separate firsthand/owner/inferred claims and recency-aware answers | H | H | M | M / M | Audit ten answers against sources |
| 6 | Questions from actual search gaps | H | H | M | M / M | Ask one volunteer a real unanswered question |
| 7 | Shareable vertical video linking to source | M | L | H | M–H / M | Three optional exports; measure returns |
| 8 | Participating venue factual updates | H | H | M | M / H | Two owners correct dated facts |
| 9 | Subject-specific creator reputation | M | H | L | M / H | Human label reliable food contributors |
| 10 | Practical visit/attendance verification | M | H | M | M / H | Optional receipt/check-in; do not expose receipt |
| 11 | Event creation by voice | M | M | M | M / M | Reuse draft boundary, stricter schedule/access gates |
| 12 | ChatGPT MCP search/save/contribute/RSVP | H | M | M | M / H | One authenticated save from an assistant |
| 13 | Other AI distribution through public pages/APIs | M | M | H | L–M / M | Measure cited sources and completed actions |
| 14 | Deovia shared infrastructure | M | M | L | H / H | Extract only after a second proven product |
| 15 | Vibelog global personal layer | H | M | L | H / H | One record with two consented projections |
| 16 | Zimium/MirWeb business connections | Unknown | Unknown | L | H / H | Only pursue a named customer workflow, e.g. consented owner update |

No broad platform integration is justified by name association alone.

## 14. Tomorrow's MVP

Sign in on the phone, open Experiences from the account menu, create a private draft, select several restaurant photos, record 30–120 seconds, stop, upload retained originals, prepare a draft, accept/edit the suggestion, correct visit date/place, review photo selection/descriptions and observations, confirm permissions/disclosure, save/preview, then explicitly publish. A published page links the creator, place and category, appears on the creator and existing venue page, and has a permanent share URL. Pending places have an address and directions link without false canonical verification.

P0 excludes video upload/generation, TTS, continuous live interviewing, semantic discovery voice, new collection/follow/save implementations, cross-site syndication, automatic translations and review scores. Existing profile follow and map/directions actions remain available. A manual narrative can be saved and published if AI is unavailable. Do not confuse this fallback with a verified working voice provider.

## 15. Later phases

1. Field-test capture/recovery and correct the hardest observed failure. Add one optional spoken turn/TTS only after provider and iPhone proof.
2. Resolve pending venues; add recency-aware retrieval, source displays, corrections/report workflow, and pilot metrics.
3. Collections/maps and opt-in post-visit invitations; qualified assistant actions.
4. Optional exports, supported content translations, creator tools and measured revenue experiments.
5. Shared Deovia/Vibelog projections only after local contribution economics hold.

## 16. Technical decisions actually made

- Existing Supabase auth and locale-aware navigation; no new login provider. New editor copy is reviewed in English, Vietnamese and French. The other nine locale routes explicitly fall back to English for this new namespace; existing translations are unchanged. Content can retain any of the 12 supported original languages. Automated content translation is deferred. A local small-model UI translation trial was rejected for mistranslating unpublish and consent; it is not shipped.
- Additive schema above, RLS reads, owner-only private sources. Validated server routes perform updates/deletes/publish with server-only service credentials after ownership checks. Direct authenticated table updates cannot bypass publication validation.
- Private `experience-originals` bucket, direct authenticated browser upload, 20 MB/file. Original photos are immutable. JPEG derivatives strip metadata; existing `heic-convert` handles HEIC where supported. No new production dependency.
- MediaRecorder MIME negotiation prefers MP4 on Safari, otherwise supported WebM/Opus. Stop/backgrounding finalizes recording and attempts preparation after the local write; bounded two-minute capture. IndexedDB recovery is account/draft-scoped. iOS termination can still interrupt the final chunk; no claim of OS background upload.
- Record → upload → transcription → schema-validated suggestion. **Turn-based, not native full-duplex live voice.** Suggestions do not overwrite saved edits; accepting a suggestion is explicit. Optional answer text and further recordings can append context.
- Preferred STT: `openai/whisper-large-v3`, `POST https://openrouter.ai/api/v1/audio/transcriptions`, JSON base64 audio and MIME-derived format. Preferred multimodal drafting: `google/gemini-2.5-flash-lite`, `POST /api/v1/chat/completions`, native JSON-schema response format plus Zod validation, low temperature and 4,000 output-token cap. Both were listed by the relevant live model APIs. Availability to the configured account still requires a credentialed smoke test.
- Environment: reuse `OPENROUTER_API_KEY`; optional `EXPERIENCE_TRANSCRIPTION_MODEL`, `EXPERIENCE_DRAFT_MODEL`, and explicitly configured `EXPERIENCE_DRAFT_FALLBACK_MODEL`. No automatic switch to another billing provider. No default fallback until tested/configured. Existing unrelated `lib/ai/provider.ts` chain is unchanged.
- Three-minute database lease plus 12 generation attempts per draft; 20 new drafts/day per account; six selected photo derivatives per analysis; 55-second provider request timeout. Actual usage is stored privately with the suggestion. No prompts/transcripts/provider responses in application logs.
- Public page is server rendered, Article JSON-LD, original-language canonical, OG selected image, author/visit/publication/update dates. No fabricated Review stars, translated-source claims or aggregate ratings.
- Production deployment convention is Vercel push-to-main. `wrangler.jsonc` explicitly forbids putting the public domain on the worker. Existing `scripts/supabase-run-sql.sh` is the repository's targeted SQL path because historical CLI migration histories diverged; never push the entire migration backlog.
- Official references: [OpenRouter STT](https://openrouter.ai/docs/guides/overview/multimodal/stt), [audio input](https://openrouter.ai/docs/guides/overview/multimodal/audio), [model discovery](https://openrouter.ai/api/v1/models?output_modalities=transcription). Documentation states request/response transcription; streaming chat is not evidence of interruption-capable live voice.

## 17. Open questions

Where is the existing OpenRouter credential stored? Can the real account serve the selected audio model for MP4 and WebM? Which 10 contributors will test without founder chasing? What operational response time is acceptable for disputes? Who resolves pending venues? What image/recording retention limits and user exports are needed? Which supported content languages justify translating a particular original? What concrete account action will prove AI distribution value? These are not reasons to redesign the whole schema.

## 18. Initial success thresholds, not forecasts

- Approximately two minutes of contributor effort to a publishable draft; first recording is sufficient.
- No recording/draft loss from an AI failure; measure interrupted-upload recovery separately from normal success.
- Two-week pilot: at least 10 contributors, 30 firsthand experiences, 10 venues; at least four contributors return without personal chasing.
- Searchers frequently save, request directions, open events or continue discovery; define a concrete baseline after measuring the first cohort rather than inventing a percentage.
- Users identify specific firsthand evidence that affected a decision.
- Track completion/abandonment by step; transcription/drafting latency and cost; corrections per claim, pending-venue resolution, repeat contribution, and moderation minutes per published experience.
- Existing timestamps/generation usage enable a small manual pilot scorecard. A full analytics dashboard is not implemented.

## 19. Implementation status and verification

Work occurs in isolated branch `feat/experience-voice-mvp`, preserving unrelated main-checkout changes. Additive schema applied successfully through the established targeted SQL helper. Initial TypeScript and focused ESLint checks pass (intentional direct-image warnings; gated images must not be cached by an optimizer). Detailed browser/provider/deployment receipt is appended after verification. **At this draft point, production delivery and voice smoke test are not yet confirmed.**

### Verification receipt (September 12)

- Real authenticated mobile Chromium journey at **390 × 844** using browser `getUserMedia`/`MediaRecorder` with synthetic test-device audio: selection, stop, offline failure, IndexedDB recovery after refresh, direct photo/audio upload, saved notes, failed-provider recovery, editing, explicit publication, anonymous rendering, actual image decode, creator/venue/category appearance, unpublish and deletion all passed. This verifies browser API integration, **not physical iPhone microphone/Safari hardware**. Temporary clearly labeled QA fixtures and accounts were deleted; no QA experience remains as social proof.
- Anonymous database reads of `experience_sources` return no rows, including after publication. Anonymous draft photos, audio and original downloads are denied; the selected published photo is accessible; unpublish revokes it. Credentials are absent from public HTML and **230 generated browser bundles** scanned for configured server credential values.
- Provider contract tests cover endpoint/payload construction, missing credentials, empty transcription, sanitized upstream failure, invalid JSON/shape, foreign photo IDs, grounded observations, unsupported locales and invalid dates. Publication tests reject missing consent, unconfirmed venues, missing photos, thin/blank stories and future visit dates. Sitemap tests verify one original-language canonical and published-only selection. These model-success tests use controlled responses; they are not represented as live provider proof.
- Full suite initially found three failures in the sitemap test adapter after adding the experience query. The adapter and an experience indexing regression test were added. Focused rerun: **28/28 passed**. Full final suite/build receipt follows below.
- TypeScript passed; repository ESLint passed with existing warnings (491 total, zero errors in the initial full run). Direct images are deliberate: authenticated/publication-aware image responses must not be detached from access control by an image optimizer cache. Next.js production build passed. Private routes use noindex and RLS; public photo derivatives use a crawler-accessible root route with publication checks.
- The real venue check exposed a missed canonical `/{slug}` render path; it was connected and retested. A separate test-profile failure was a fixture username exceeding the existing 20-character limit; the fixture was corrected without changing application username rules.
- OpenRouter's public discovery API lists both chosen models. **Local `.env.local` and Vercel production contain no `OPENROUTER_API_KEY`; therefore no credentialed OpenRouter smoke test or successful production AI generation is claimed.** The user was asked for the existing credential's location without asking them to paste it. No key was printed, committed, or silently replaced by a different voice provider.

### Exact remaining activation step

Locate the existing OpenRouter key and install it as server-only `OPENROUTER_API_KEY` in the existing Vercel project through its protected environment workflow (and local ignored environment for the smoke test). Then run one short MP4/WebM transcription and one bounded structured draft request with a real photograph, verify usage/latency privately, redeploy, and repeat on the physical iPhone. Do not purchase credits or change billing. If the account cannot serve a selected model, choose an available compatible model explicitly through the documented environment override and record the actual choice and test result here.

Until then, tomorrow's usable fallback is **original photos + retained recording + manually written story → review → publish**. This is a working public contribution journey, but it does **not** yet satisfy the complete AI-assisted restaurant goal. Pending venue reconciliation, physical iPhone testing, nine additional reviewed UI translations, automatic content translations, polished analytics and a dedicated dispute intake remain later work.

### Committed release gate

The feature was rebased onto current remote main without carrying unrelated, locally unlanded commits. The current repository guidance and service-worker changes were preserved; the next service-worker version is **1.0.29** (the application package is otherwise unversioned). A separate clean checkout with `npm ci` verified the committed tree: **126 test files / 791 tests passed**, all prebuild gates passed, and the production build passed. Media registration now rejects an ID belonging to another draft and retries its own registration without rewriting the original. Locale-aware draft creation defaults to the Đà Lạt calendar date, and captions can be edited manually. Production deployment is the next gate, not implied by these local results.
