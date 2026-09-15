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


### AI activation follow-up — September 13, 2026

The user identified the existing credential at `~/.openrouter`. It was read without printing it and installed as sensitive, server-only `OPENROUTER_API_KEY` in the existing Vercel production project. No billing changes, key copies in source, or provider substitution. This supersedes the September 12 missing-key blocker once the new deployment is verified.

A controlled private smoke test used 10.836 seconds of locally synthesized QA speech (explicitly not a real review) and a solid-color test image. `openai/whisper-large-v3` transcribed the speech through OpenRouter in 2.368 seconds, costing $0.00008127. Gemini initially rejected the deeply bounded JSON schema because its constrained decoder could not compile it. The provider wire schema now retains objects, required fields, enums and types while omitting decoder-expensive string/array/numeric/format bounds. The full original Zod contract still validates every response before storage, including length limits, UUIDs and confidence bounds. A regression test proves an overlong model title remains rejected.

With that compatibility repair, `google/gemini-2.5-flash-lite` returned a validated photo-aware draft in 3.246 seconds, costing $0.0003444. These are small-fixture observations, not latency guarantees for 120-second recordings or actual restaurant photographs. Models and endpoints are unchanged. Physical iPhone/Safari and an authentic restaurant contribution still require the field test.

### Field-test follow-up — September 13, 2026 (release 1.0.40)

The first physical iPhone feedback changes the immediate scope: a massage visit and a university event must be first-class experiences. Restaurant-specific copy was a misleading restriction, not the intended entity model. The Experience remains a durable firsthand story; an Event remains a scheduled gathering and Moments remain individual media. A visible Events / Experiences / Moments header row gives published stories their own browsing home at `/experiences`, with creator profiles and venues as additional entry points. Wellness is an additive category; new drafts default to Other. No existing categories or records are removed.

The contributor reported a cutoff after roughly a minute and an audio-player error. The exact recording has not been identified or recovered, so no specific cause is asserted. Concrete code findings: a 120-second automatic stop, missing HTTP byte-range responses for Safari audio, and automatic PWA update reloads that did not protect Experience editors. The revised recorder removes the timed stop (18 MB file limit remains), coalesces IndexedDB writes, explains background interruption, provides private audio downloads, and serves authenticated byte ranges. PWA updates defer reloads on Experience creation/editing pages. The operating system can still interrupt microphone capture; the app must remain open.

**Explicit provider decision:** record-and-draft continues to use the funded OpenRouter account. The additional Live interview uses the existing OpenAI account directly, disclosed before starting. Official OpenRouter audio request/response or SSE support does not establish native full-duplex transport. OpenAI's documented [WebRTC interface](https://developers.openai.com/api/docs/guides/voice-webrtc) provides native two-way audio with interruption. The server relays SDP via `POST /v1/realtime/calls`, using `gpt-realtime-mini` (override `EXPERIENCE_LIVE_MODEL`), `gpt-4o-mini-transcribe` input transcription, semantic VAD with low eagerness, and the Marin voice. No ephemeral or permanent API key reaches the browser. Session issuance was smoke-tested successfully; a complete browser audio round trip is a separate gate recorded below. OpenAI sessions are bounded to 60 minutes, not unlimited; a contributor can start another session in the same draft. Live model costs are separate from OpenRouter credits. No billing or plan settings changed.

Live audio is archived privately as independently complete approximately one-minute files without stopping the WebRTC microphone. User and assistant transcript turns persist privately after each completed turn, with account/draft-scoped IndexedDB recovery and idempotent server append. Only **user turns** enter the evidence used for OpenRouter draft generation; assistant questions cannot become firsthand claims. Finish saves the conversation and archive, then prepares a suggestion. Publication remains a separate review action. Bounds: 200 conversation turns / 250 KB, 100 audio files, 12 photographs; the existing provider attempt limiter also applies. Long uninterrupted turns have an audio archive before their transcript completes. Abrupt OS termination may lose the current incomplete archive segment. Audio is retained even when a draft model fails; no claim of background recording or guaranteed recovery after device failure.

Schema additions: `experience_sources.live_conversation` under existing private RLS; `experience_media.capture_mode` distinguishes normal recordings from live archives and prevents duplicate transcription; service-only row-locked `append_experience_live_turns` deduplicates immutable turn IDs. Both additive migrations were applied with the established targeted SQL helper. Live endpoints authenticate ownership and reject published drafts. A pre-existing Next.js build-time `env` mapping for the OpenAI key was removed; existing key alias compatibility now stays in server code.

Loading work removes the editor's duplicate client auth/database GET by supplying owner-authorized initial data from the server. Device recovery completes before editing is enabled. The public hub streams separately from private drafts, and a route skeleton gives immediate visual feedback. Initial production baseline on a fast desktop connection, mobile viewport: form visible in 1,648 / 561 / 588 ms across three visits, with one redundant draft GET each. These are small-sample navigation timings, not iPhone/5G guarantees or Core Web Vitals. The requested DevTools performance skill connector was unavailable; browser timing and visual checks are used instead.

Localization: generic experience labels, navigation and wellness have all 12 locale entries. Some new live-interview help/error strings use English fallback outside English, French and Vietnamese; reviewed translations remain necessary. No generated story translations or extra synthetic social proof are introduced. Discovery voice, numeric ratings, event auto-linking, and generated video remain out of scope for this repair.

Verification before release: a native Chromium WebRTC call received spoken interviewer audio, transcribed a synthetic university-event story, received a relevant spoken clarification, stored both roles privately, archived playable audio, and produced a validated OpenRouter draft. This is an actual provider round trip, not mocked streaming. A separate real MediaRecorder test remained active at 42, 84 and 126 seconds. Stopping offline retained the binary recording in IndexedDB; reload/reconnect uploaded two photographs plus audio while a controlled draft-provider outage still preserved the draft. A separate brief recovery/lifecycle rerun published a clearly labeled temporary wellness fixture, verified its profile/category visibility and private audio, then removed it. An initial lifecycle selector failure exposed a missing explicit accessible category name; this was fixed and the rerun passed. No real contributor content was published by the tests. Screen wake lock follows the existing table-clock pattern when supported; denial does not prevent recording. The exact user's failed iPhone recording remains unverified.

Live provider usage/cost aggregation and reviewed translations for the new interview copy remain follow-ups. The 60-minute provider maximum is not a guarantee that every phone/network can sustain a full session. Full clean-commit checks and production verification are recorded in the release handoff; the local test does not substitute for physical iPhone acceptance.

Release gate: a separate clean checkout with `npm ci` passed **142 test files / 848 tests**, repository prebuild guards and the full Next.js production build including TypeScript. Repository lint passed with warnings and no errors. Service-worker version advances from 1.0.39 to **1.0.40**. The complete implementation and these local checks are finished; production deployment and field acceptance are tracked separately in the release handoff and PR #56.

### Effortless contribution follow-up — September 13, 2026 (release 1.0.41)

Physical iPhone feedback exposed a failed product handoff: an enjoyable conversation ended in a long empty form, because generated values waited behind a separate acceptance button. The product hypothesis is now **Record → I'm done → filled review → Publish**. Photos alone and a single sentence are valid contributions. Completeness is not a condition of saving a private draft. Publication still requires an explicit contributor action; saying “finish” never publishes.

The primary live control is a large labeled Record / I'm done button. A Realtime `finish_experience` function ends and saves the session when the contributor asks to finish, including spoken requests. The interviewer is instructed to ask at most one optional “Anything else?” in the entire conversation, with a session instruction update suppressing further questions after the opening and first response. This is model-mediated behavior, not a mathematical guarantee of question count; the visible finish control always remains available.

Finishing automatically applies validated OpenRouter values, persists the filled draft, and opens a compact review. Existing saved generation can fill previously blank owner drafts on reopening. Contributor corrections, removed photographs, confirmed venues, permissions, sponsorship and visit date survive regeneration. Manual fields are collapsed under Edit details; recordings and notes are collapsed; audio archives no longer preload. The unrelated floating Moment upload control and bottom navigation are hidden in Experience editors. Save and close remains available without title, story or place completion. Publish itself is the explicit affirmation of the clearly displayed authorship, media permission and sponsorship statement, replacing an additional checkbox.

All selected photographs (up to the existing 12-photo limit) are supplied to the vision-capable OpenRouter draft model. Empty text is supported; photo-only wording must describe visible evidence without invented attendance, feelings or atmosphere. A test exposed embellished wording on solid-color fixture photographs and the prompt was strengthened accordingly. Human review remains necessary: structured validation verifies the contract, not factual truth. Video analysis and parallel specialist models remain future work; adding extra paid calls does not establish better evidence.

Original photo EXIF is read privately for valid GPS and capture date. GPS suggests nearby records from our own venue database only, within an approximately 200-meter bounding box; it never automatically identifies or confirms a venue. Missing metadata, no nearby venue, multiple venues and parser failures do not prevent saving or publishing without a place. A contributor explicitly chooses a suggested place or date. Raw coordinates are not passed to the language model or public page. Public photo derivatives continue to strip EXIF. No Google venue content is scraped. Address/name-based matching remains available under Edit details. Suggested places are candidates, not verified visits.

The compatible `20260913003_experience_short_contributions.sql` migration relaxes publication completeness to a title plus narrative or selected photo, with explicit permission and confirmation only when a place is present. It was applied using the targeted SQL workflow. There is no new table, provider, credential or billing change. Public pages omit an absent Place relationship instead of emitting an empty place or directions link. Existing ownership, private sources, publication authorization and media validation remain enforced.

Verification: the mobile-sized Chromium photo-only journey generated and automatically saved a complete two-photo draft, reopened it, explicitly published it and rendered an anonymous public page. A separate actual OpenAI WebRTC call using clearly labeled synthetic QA speech ended via the spoken finish request, preserved transcript and audio, generated a validated OpenRouter draft, automatically filled the review, reopened it and published successfully. Temporary test records/accounts were removed. Editor HTML and downloaded client bundles were checked for server credential values; none were present. The full suite initially passed 848 tests; additional private metadata tests cover valid hints, invalid dates/coordinates and parse failure. Mobile review and public-page screenshots were inspected. These browser checks do not substitute for the next physical iPhone PWA test. Production readiness is confirmed separately in the release handoff after deployment, not inferred from local success.

The next three high-value steps are physical iPhone acceptance of this short flow, trustworthy place resolution for photos without GPS, and measurement of completion rate, latency, cost and repeat contribution. No new generation feature takes priority over these.

Additional release checks: a controlled HTTP 503 from draft preparation preserved both uploaded photos and the private draft, exposed manual recovery, and allowed Save and close. A real JPEG EXIF fixture resolved nearby existing venue candidates without auto-confirmation or returning raw coordinates. The strengthened photo-only prompt returned a literal color-swatch description on the next fixture run. A separate committed checkout passed **144 test files / 851 tests**. Its first build started before the ignored environment link was installed and failed for missing Supabase configuration; the corrected configured build is the relevant release gate.

## Discussion addendum — September 13, 2026: a life you can enter

This discussion extends the shipped Experience MVP (1.0.41); it does not replace its private evidence, native voice, preview, explicit publication, localization or deployment architecture. Statements below distinguish verified implementation from decisions for this increment and future hypotheses. The immediate acceptance test remains a real contributor completing an experience on an iPhone without constructing a page manually.

### Thesis and the actionable question

**Product hypothesis:** “TikTok shows you a life you can watch. ĐàLạt.app shows you a life you can enter.” The useful distinction is actionable local knowledge rather than a claim that other networks cannot inspire action. A beautiful story attracts attention; the viewer's decision is **Can I do this too?** An honest answer can be “that gathering is over; explore the venue or find another event.” Unknown access, future dates or eligibility must remain unknown. Publication permission is not event admission permission.

Original, attributed and contextual evidence, corrected entity relationships, recency, independent perspectives and authenticated actions can compound. Rewriting prose, transcription, generic video transitions and hashtags are replaceable model capabilities. We should buy those capabilities economically, not mistake them for the moat. Creator value must survive without an audience: a personal memory, durable page, useful journal and shareable artifact. Repeat contribution after the novelty fades is the test.

### Five connected layers

| Layer | Existing reality and intended responsibility |
| --- | --- |
| Evidence | Private original photographs, recording archives, transcript and user-only conversation evidence; contributor identity, visit date and selected public photo derivatives. Video remains unsupported in this MVP. |
| Knowledge | Experience category, tags, contextual observations, canonical venue reference or pending submission. Events, tribes/clubs and organizers already exist elsewhere; automatic linking is not yet established. |
| Story | Editable title, narrative, summary, captions, stable page and share metadata. AI wording is not a direct quotation. Translations, narration and video must point back to this same experience. |
| Action | Existing directions, venue and creator pages, related experiences; this increment adds a clearer truthful next-action surface and independent contribution at the same canonical venue. No invented save, RSVP, follow or reminder capability. |
| Distribution | Experience hub, profile, venue/category connections, share links and crawlable original pages. Collections, living maps, social exports, semantic retrieval and authorized MCP actions are later. |

The source record remains one unit of social proof regardless of how many translations, narrations or videos are derived. Another person choosing “I experienced this too” creates a new private draft owned by that person, linked to the same confirmed canonical venue when available. It must not copy narrative, rating, observations, date, consent or media. A venue link is not evidence that the second person attended. Event/activity associations and attribution to the inspiring experience can be additive future relationships rather than merging accounts.

### Adaptive contribution without a mandatory form

Already live: original media preservation, first-recording drafting, large Record / I'm done controls, spoken finish, automatic saved preview, collapsed Edit details, photo-only contributions, optional place, private drafts and explicit Publish. Owner profile → experience → Edit permits later editing through the existing unpublish-first rule. This deliberate rule protects the published version; silently rewriting a live page during generation is not added.

This increment makes conversational pace adaptive. Quick remains the default after the founder's feedback: one optional closing invitation. Natural permits about two or three valuable questions. Story continues only when the contributor asks for more; there is no question-count cap in that mode. Monologue means listening without automatic spoken responses. These are conversational states, not a mandatory four-step setup. “Ask me more” can expand the session; “let me keep talking” can silence the assistant. “That's enough,” “I'm finished,” and “prepare it” finish the interview and start preparation. “Publish it” follows that same preview path and never bypasses the explicit Publish control. Existing provider/session, device, size and abuse limits remain disclosed operational limits, not a forced interview duration.

The preview is the editing surface. Only consequential uncertain place/date information should request a small confirmation. Optional factual gaps such as whether an entire menu was vegetarian need not block publication; omit the stronger claim. Full fields stay behind Edit details. A failed AI request still permits saving, retry and manual recovery. Additional questions should follow the contributor's appetite and demonstrated atlas/search gaps, not a checklist of missing database fields.

### Repeatability, access and next actions

Do not collapse time, availability and eligibility into one enum. The future model should separate temporal state (now/upcoming/past/ended), repeatability (one-time/recurring/seasonal/unknown), access (public/invitation/students/private/unknown), and evidence/checked-at time. “Available anytime” requires evidence and never means open 24 hours. Experience publication status is separate from all of these.

For this increment, the safe derivation is intentionally conservative: an Experience is a dated account, not a current admission offer. Cards and pages label it as a past account and disclose that current availability and access are unverified. Directions and exploring a canonical venue are useful without claiming it is open. A past university initiation story does not get a Join button. A general View upcoming events link can open current discovery; it must not be described as the organizer's next event without a verified relationship. No recurrence notifier, instant RSVP, or save/follow button is shown unless it actually works through existing application infrastructure.

The university example can describe the campus, English/sports clubs and visible or reported activities as contextual observations with source evidence. Do not create clubs, identify participants or imply public admission from photographs. Unknown eligibility stays unknown. Matching an actual scheduled Event and linking the organizer's next occurrence needs a verified entity relationship; this remains a later increment.

### Entity resolution and media clues

Existing EXIF candidate lookup is a weak signal and requires confirmation. This increment adds bounded name normalization and existing-venue matching from the generated place name, so missing GPS is not a dead end. Normalize accents, spacing and generic venue descriptors; compare distinctive tokens and rank likely matches. Le Pin / LePin Coffee / Le Pin Café should suggest the same candidate where the canonical record exists, not create several new records. Similarity is a candidate ranking, not factual certainty. Ambiguous candidates require selection; canonical venue creation is never delegated to the model. Unmatched contributor-supplied name/address remains a pending submission, not a canonical entity.

A future alias table should retain evidence and reviewer ownership, avoid global ambiguous short aliases, and link to canonical IDs. University, club, event, dish and activity creation need the same resolve-before-create principle. The MVP does not create these new entities automatically.

Approved inputs are contributor originals, private EXIF, transcript, visible signage/menu/poster/receipt text interpreted by the vision model, existing Dalat entities and user confirmation. Current device location requires permission and is not added. GPS may be absent or inaccurate; do not guess from one signal or publish private coordinates. Never scrape Google Maps, Instagram or other platforms for permanent imagery or derivative promotions.

A menu photo is historical evidence. Show its observation context; do not label it the official current menu. Future menu records separate photographed date, extracted text (AI), business-confirmed current menu and historical versions. Hours, price and menu claims carry source/date and refresh needs; no evergreen venue assertion is inferred from an old experience. Authorized business updates must not edit a contributor's independent account.

### Privacy and generated presentation

Current defaults: every new contribution is private, originals/audio/transcripts stay private after publication, public selected photo copies strip metadata, individual media can be removed, and publication is explicit. Stronger event-specific copy will remind contributors about recognizable people, minors, private gathering access and sensitive locations. Possession of a photograph is not consent for promotion. Where consent is uncertain, remove the photograph or keep the draft private. Automatic recognition of minors is not claimed.

Face blurring is deferred: it needs reversible derivatives, original preservation, detection/selection UX and visual validation; there is no pretend blur control. Public/private here means private draft versus published page, not a full audience-permission system. Reporting/removal and disputes need a more explicit dedicated workflow; do not imply new moderation tooling exists. Do not identify people, publish home locations, fabricate speech or endorsements, or convert a photograph into promotional participant media without appropriate permission.

Generate the core page first. Future vertical video uses original clips/photos, faithful crops, sequence, stabilization, captions, licensed music, optional narration and clearly labeled illustrative transitions. Never enlarge a venue, remove crowds to suggest quiet, invent dishes/attendees/views or attribute synthetic speech to real people. Materially generated presentation needs an elegant AI-assisted indicator and a link to evidence. No generated video runs in this release, so video-generation spend is zero. Future jobs are asynchronous and opt-in or demand-triggered (creator request, interest, eligible paid feature, or available local capacity), with measured per-job cost, latency, retries and cancellation before scaling. No cost estimate is presented as a measured result.

### Discovery loop, collections and distribution

Experience something → talk naturally → receive a story → enrich the atlas → inspire someone → help them act → invite their independent perspective. The next loop is discover → ask if possible → visit/join/directions/follow/save → optional post-visit “How was it?” → record → update profile/atlas → another perspective. Only the working subset is claimed at handoff. Automatic post-visit prompts need opt-in and timing evidence, not location surveillance.

Creator-owned living guides (vegetarian Dalat, quiet work cafés, photography walks, rainy days, bicycle discoveries, affordable dates) can provide repeat personal value and distribution. Save/follow/update behavior is a future product, not a generated list of duplicate pages. Public canonical pages retain creator, precise dates, original media, summaries and current-versus-historical distinctions. Original transcripts remain private by default; the distribution goal does not change privacy. No crawler training preference is changed, and no thin keyword/translation pages are added.

Future authorized MCP tools should search recent experiences, answer source-backed questions, find available events, save plans, follow, create private drafts, add user media, review, explicitly publish and RSVP only where supported. An authenticated account action can create Dalat value inside ChatGPT without a browser visit. Measure these actions rather than relying on referral traffic alone.

Atlas gaps should come from observed demand: repeated searches for quiet work after 8 p.m. justify an optional evening-noise question to a relevant visitor. Store observed date, time/day, room/area, contributor, source type, uncertainty and refresh need. A Tuesday-evening impression never becomes a universal noise attribute. A future consensus answer counts distinct sources, mentions disagreements and the newest evidence date.

### Additional red team: earliest warnings and smallest mitigations

| Material risk | Why it matters / earliest measurable warning | Smallest mitigation | MVP blocker? |
| --- | --- | --- | --- |
| Ended experiences frustrate “Can I do this too?” | Clicks on expired participation paths; users report unavailable activities | Past/unknown labels; working venue/current-discovery alternatives; no Join without verified occurrence | False availability blocks; conservative labels do not |
| Novelty fades | Fewer than four of ten test contributors return without chasing | Deliver a keeper/shareable page; ask what they reopened, not whether they like AI | Blocks scale, not the test |
| Generated beauty harms trust | Readers misidentify generated material or corrections rise | Originals first, restrained wording, material-generation labels, no automatic video | Fabrication blocks publication |
| Duplicates ruin retrieval | Same-place submissions multiply; confirmations frequently corrected | Rank existing IDs, explicit selection, pending queue, aliases later | Unchecked auto-creation blocks |
| Stale menu/events cause bad visits | Complaints about prices, access, hours or ended gatherings | Dates, uncertainty, separate official versus observed records | Unsupported current claims block |
| Video costs exceed value | Cost per completed/shared export and queue latency exceed the validation budget | Opt-in asynchronous jobs, hard budget/retry limits; no video by default | Keep out of P0 |
| Faces/minors/private places create disputes | Removal requests, consent confusion, private addresses in output | Private drafts, selected media removal, targeted notice, omit locations, no synthetic participant media | Sensitive unconsented publication blocks |
| AI prose feels inauthentic | Heavy rewriting, users prefer transcript, declining shares | Short faithful language, retained private voice, easy edits; do not force literary tone | Test and measure |
| Confirmation destroys ease | Abandonment at venue/permissions; long time-to-publish | One-tap consequential confirmations; optional place; no mandatory schema form | Current broken completion blocks |
| Feed becomes generic AI output | Low source-detail recall, repetitive titles, fewer action clicks | Original evidence and attribution, dated claims, prioritize useful actions over output volume | Blocks expansion, not small test |
| ChatGPT consumes all value | Answers without attributable traffic or account actions | Source URLs plus authenticated save/follow/RSVP capabilities later | Distribution hypothesis, not P0 |
| Models are mistaken for the moat | Spend rises while repeat contribution/evidence coverage stays flat | Invest in contributor relationships, entity correction, provenance and actions | Blocks broad generation investment |
| Endless adaptive interviews | Optional questions continue after stop or impatient cues | Explicit Finish, finish tool, Quick default, Story only by request, saved evidence | Must pass before release |

### Scope and validation decision

P0 additions: adaptive pace and reliable finish; bounded existing-name venue candidates; honest dated-account/unknown-access labels; supported next actions; independent contribution linked to a canonical venue; targeted event privacy guidance. Preserve existing provider adapters, native WebRTC, private storage and explicit review. No sweeping schema redesign, automatic event/club creation, numerical rating system, video, face processing, reminders, collections or new feed engine.

Verify mobile quick contribution without opening details, longer multi-turn Story then stop, photo-only/missing GPS, alternate-name matching, past gathering with no Attend promise, recoverable AI failure, and targeted event-photo guidance. Current working behavior and measured test results will be appended after implementation. The highest-value validation after the restaurant test is whether another person makes a real decision from its dated evidence, then contributes a distinct account without being chased.

### Implemented discussion increment and verification

Implementation follows the addendum without adding an availability schema that the evidence cannot yet populate. Public cards now include creator attribution, dated/past-account and unverified-availability labels, and original-photo identification. The page's Can I do this too? panel links to its existing venue or upcoming-event discovery and starts a new independent contribution. Creator links lead to the existing profile, where follow controls already live; no nonfunctional inline follow/save/reminder controls were invented. The unrelated floating Moment creator is hidden throughout Experience surfaces.

Venue candidate ranking reuses existing Unicode/Vietnamese accent normalization, compares compact names and distinctive tokens, and retains competing matches. A read-only, authenticated Experience venue endpoint serves the bounded city catalog (first 1,000 canonical names; a database indexed search is required before outgrowing this bound). Name matches precede weak GPS candidates. Nothing creates or silently chooses a canonical venue. Pending submissions remain a review queue; alias persistence and automatic Event/club relationships are deliberately deferred.

Adaptive voice uses the existing native OpenAI session and documented `session.update`/function-call controls ([official conversation documentation](https://developers.openai.com/api/docs/guides/realtime-conversations)). Quick is the default; explicit requests change to Natural, Story or Monologue. Monologue disables automatic responses and uses completed-transcription commands for finish/resuming questions; the visible finish button remains available. Standalone command recognition currently covers English and core French/Vietnamese phrases, not every paraphrase in all locales. The model interprets broader intent in conversational modes. Device/session and storage limits remain unchanged. No provider substitution or new credentials.

The privacy reminder is based on event/people context in the story and captions; it is not a face detector, minor classifier or consent verifier. It links to the existing selected-photo controls and preserves private saving. No extra mandatory event form was introduced. Automatic blur and audience access controls require another slice; users must remove unshareable media or retain a private draft. Menus/prices/access are explicitly dated evidence, not current official business information. No video jobs run and video generation costs remain zero for this increment; transcription/draft/live usage retains the existing metered providers and documented limits.

Local verification so far: an actual multi-turn WebRTC QA story requested more questions, received an additional question, then requested silent listening. Later turns were preserved without further assistant speech; “That's enough” stopped, archived, generated and saved the preview. Explicit publication rendered the uncertainty/action panel, profile/category links and private-audio boundary. A second mobile test used GPS-free photographs and a compact informal name for the real canonical Le Pin Dessert & More venue; the first run exposed a descriptive-suffix matching miss, fixed with regression coverage. A one-tap canonical selection then persisted through save/reopen without opening the full form. Two separate QA accounts verified independent authorship, shared canonical venue and no copied story/media/claims/consent; a private source returned 404. Controlled generation failure preserved both photographs and private draft, exposed recovery and allowed Save and close. Temporary QA records were removed. The initial full suite passed 874 tests; final clean-checkout counts/build and deployment are recorded at the release gate below. Mobile screenshots were inspected; physical iPhone and real participant consent are not proven by synthetic fixtures.

**Founder steering, September 13: Publish is the confirmation.** A real An Lạc Tâm contribution showed that the additional “Yes, this is the place” requirement stopped an otherwise finished story. The explicit Publish button now affirms the displayed experience, place and media-permission statement in one action. The separate place-confirmation button and checkbox are removed. Place correction/removal and optional canonical match selection remain available before publishing; no ambiguous candidate is silently selected. Drafting, saving, AI generation and voice “publish it” do not set publication consent. The API/database retain the attestation flags; only the explicit frontend Publish action sets them. This supersedes earlier language requiring a separate one-tap venue confirmation. Genuine missing content or an invalid/future date still receives a useful validation message rather than being published incorrectly.

**Founder steering: attributable people, not “the reviewer.”** Cards and page bylines use the actual clickable @username. Generated preview and public narrative/summary/observations resolve generic reviewer/contributor references to that verified creator's profile, including existing drafts; original saved source text is not rewritten. No model-generated username is trusted as identity. New narrative prompts favor faithful first-person wording and direct summaries instead of anonymous reviewer labels. Missing usernames do not produce invented links.

### Original voice and source sharing — September 13 discussion

Founder proposal: let contributors share original voice, text and eventually video alongside the generated story, potentially selected by default. Personal voice can improve humanity and provenance. Proposed presentation: **Hear @username’s story**, clearly distinct from synthetic narration.

Deliberate MVP difference: existing interview recordings and transcripts remain private. A conversation may include corrections or private asides; the prior private promise must not silently change. Public voice needs an explicit per-recording choice and playback preview; a future remembered preference can reduce repeated friction for new contributions. Public photos already use selected, metadata-stripped copies. Sharing original text or video should likewise expose only the chosen material, with removal controls. This is a proposed next increment, not a shipped audio-publication capability. No video generation or public-audio storage changes were added in this release.

Release checks: **148 test files / 880 tests passed**, TypeScript passed, ESLint reported zero errors (493 existing warnings). A 390px browser fixture verified that generic reviewer text becomes the correct clickable profile handle in preview and public summary/story/byline while stored wording remains unchanged. Another fixture published a previously unconfirmed displayed place with a single Publish click; no extra place button remained. Both QA accounts and their fixtures were removed. New strings are translated in English, French and Vietnamese; the other supported locales retain explicit English fallback pending language review. Upcoming-event discovery is shown for culture accounts without a canonical venue, not indiscriminately for every unlinked place. No schema or credential changes are required.

Production acceptance: PR #58 deployed READY as 1.0.42 (`01455498`, Vercel `dpl_4PnzWGNedUcxtFcMbayrvDwtJfHz`); separate committed checkout build and all 880 tests passed. Live production tests confirmed one-click venue/permission publication, linked verified usernames, no-GPS alias suggestions, independent second-author drafts without copied evidence, and rendered original photographs. The actual native voice test successfully requested Story mode, then Monologue, and “That's enough” preserved several turns and recordings, generated a saved private review and published explicitly. Client HTML/bundle checks found no server credentials. Temporary QA data was removed.

That production run exposed a category assumption: a university gathering can legitimately be classified Other, which hid the upcoming-discovery link when gated only on Culture. The follow-up release also recognizes gathering context in the title/summary/story, without claiming recurrence or access; ordinary meals/massages do not acquire an irrelevant event action. A regression test covers this distinction. Public original voice remains a proposed opt-in feature, not part of this patch.

## September 13 addendum: clickable topics and evidence-linked discovery

Founder direction: observations such as **quiet** should lead to other relevant experiences and places. Implemented scope: existing tags become clickable chips on public pages and cards; recognized, firsthand/impression descriptors in supporting observations link directly to the same topic view. Comma-separated descriptors such as spicy, salty and sugary retain their original wording while linking separately. This works with already published experiences and does not rewrite their evidence or require another AI generation.

`/experiences?tag=quiet` searches published tags and reported observation values, with category refinement, recency order, contributor attribution, visit dates, and existing venue links. The result is evidence from visits, not a claim that every linked venue is always quiet or currently available. Clear, curated equivalents (quiet / yên tĩnh; vegetarian / chay, plus selected French variants) share a topic. Quiet and peaceful, and vegetarian and vegan, remain distinct. Arbitrary valid contributor tags also work; this is bounded topic equivalence, not multilingual semantic search for every paraphrase. Inferred observations, prices, estimated seating, and negated phrases do not automatically become affirmative descriptive chips. Explicitly published tags remain contributor-approved labels; this is not independent verification of a venue property.

Two additive SQL helpers normalize and query the existing fields. The search function uses SECURITY INVOKER, caller RLS and an explicit published-only filter. It does not expose original recordings, transcripts, private drafts or any new write authority. The targeted migration is `20260913004_experience_topics.sql`; no table/data rewrite or provider call is involved. Pagination returns 24 accounts plus a next-page sentinel, bounded to roughly 10,000 results for this MVP. An indexed topic table/materialized search representation should precede city-scale growth. The query uses exact normalized tags/descriptor chunks, not unsafe dynamic SQL or loose substring matches such as matching “not quiet.”

Filtered topic URLs use the established locale-aware hub and are noindex/follow with the hub canonical. They do not create hundreds of thin indexed keyword pages or change crawler training preferences. Existing canonical experience pages retain original value. New UI strings cover English, French and Vietnamese, with the established English fallback for the remaining locales.

Verification before release: topic unit tests cover explicit aliases, negation, inferred-source exclusion, compound descriptors, bounded input and URL composition. Anonymous database tests matched original observation-only accounts and normalized Vietnamese tags, excluded private/negative/inferred fixtures, applied category filtering before pagination, and checked more than 24 results inside a rolled-back transaction. A 390px browser test clicked the actual **quiet** observation into matching accounts, refined by category, checked no nested links and noindex metadata, and followed Vietnamese links without doubled locale prefixes. Temporary QA accounts and records were removed. No AI/provider spending was required for this increment.

Release validation: the full suite passed **150 files / 885 tests**, with TypeScript and zero errors from focused ESLint (two existing image-component warnings). The migration was applied successfully through the repository's targeted SQL runner. The patch is versioned 1.0.44; deployment and a final live click-through are the remaining release gates, not assumed from local checks.
