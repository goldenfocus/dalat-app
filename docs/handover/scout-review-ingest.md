# Scout + Review ingest pipeline

Fully automated event ingest for dalat.app. No human approval step. Scout and
WhatsApp find missing Đà Lạt events; they land as **drafts** with provenance;
Dalat Review publishes only rows that pass deterministic checks; post-publish
QA reports translation and image gaps without inventing content.

Activity Graph remains a **separate** auto-publish lane. Do not submit scout or
WhatsApp drafts through `npm run activity-graph:submit-scout`.

## Flow

```
WhatsApp groups / Dalat Scout
        │
        ▼
 POST /api/import/scout     (or WhatsApp service-role upsert)
        │  status=draft, needs_review=true
        ▼
 Dalat Review bot
        │
        ├─ POST /api/import/review  { action: "evaluate" | "publish" }
        │
        ├─ POST /api/import/review  { action: "reject", reasons: [...] }
        │     status stays draft; needs_review=false
        │
        └─ POST /api/import/review  { action: "qa" }   after publish
```

## Environment

Set these in Vercel / `.env.local` / the Mac mini vault. Never commit values.

| Variable | Where | Purpose |
| --- | --- | --- |
| `SCOUT_INGEST_KEY` | App | Bearer for `POST /api/import/scout`. Fail-closed if unset. |
| `REVIEW_INGEST_KEY` | App + optional WhatsApp hook | Bearer for `POST /api/import/review` (and WhatsApp `REVIEW_HOOK_URL`). |
| `NEXT_PUBLIC_SUPABASE_URL` | App + WhatsApp | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | App + WhatsApp | Server-side writes only |
| `IMPORT_CREATED_BY` | App + WhatsApp | Profile UUID owning drafts (default: username `yan`) |
| `WHATSAPP_GROUP_JIDS` | WhatsApp Mac mini | Comma-separated `…@g.us` allowlist |
| `REVIEW_HOOK_URL` | WhatsApp (optional) | Notify URL after a WhatsApp draft upsert. **Not** `/api/import/review`. |
| `CRON_SECRET` | App (already set) | Bearer for `GET /api/cron/translate-events`. Not a new secret. |

Event translation does not add a provider key. It uses the existing
`lib/ai/provider.ts` chain. `OPENAI_API_KEY` (`gpt-4.1-mini`) and
`ANTHROPIC_API_KEY` are the production safety net when Cloudflare or
OpenRouter is down.

Moderator cookie auth (`lib/import/moderator-authorization.ts`) is for humans
only. These routes ignore cookies.

## Dalat Scout — `POST /api/import/scout`

```
Authorization: Bearer <SCOUT_INGEST_KEY>
Content-Type: application/json
```

Always inserts/updates `status: "draft"`. A `publish: true` flag is ignored.

Required:

- `title`
- `description` — copy source wording. A `Canonical facts from source:` block is welcome; never invent facts.
- `source_url` — public http(s), used for idempotency
- `starts_at` (ISO) **or** `date` (`YYYY-MM-DD`) plus optional `time` (`HH:MM`, Asia/Ho_Chi_Minh)
- `venue` or `location_name`
- **visuals (do not invent or duplicate images):**
  - at least **3 distinct** URLs across `source_image_urls[]` + `promo_image_urls[]`
    (first distinct URL becomes the hero; the next 2–4 distinct URLs become
    `promo_media`), **or**
  - `visual_gap_reason` documenting why a full hero + 2–4 promo gallery cannot
    be sent (0+ real URLs allowed with the reason)

Optional: `ends_at`, `address`, `google_maps_url`, `source_platform` (not
`activity-graph`), `source_locale` (persisted as-is when it is a supported
locale; otherwise Vietnamese-unique letters infer `vi`, ignoring Đà Lạt /
Lâm Đồng place names), `source_image_urls[]`, `promo_image_urls[]`,
`visual_provenance` (`owner_authorized_source` \| `ai_generated`), `image_alt`,
`image_caption`, `visual_gap_reason`, `organizer_name`.

Behavior:

- Re-posts of the same canonical `source_url` do not create a second row.
  A re-post after Review `reject` resets `needs_review=true` and clears
  `review_result`.
- Re-posts onto an already-**published** row refresh hero/promo only
  (`attachVisuals` + `replacePromoMedia`). They update `image_url`,
  `image_alt`, `source_metadata.promo_count`, and visual provenance, keep
  `status=published`, and return `{ updated: true, duplicate: false }`.
  Facts, review result, and translation enqueue metadata are not reset.
  Cancelled rows stay a no-op `{ duplicate: true, updated: false }`.
- Past events and starts more than 45 days out are rejected (`422`).
- Missing images **and** missing `visual_gap_reason` is rejected (`400`) before
  any draft write. Empty image arrays do not count. One or two distinct URLs
  without `visual_gap_reason` is also `400` — a single-image post must not
  publish with an empty promo gallery.
- After fetch/upload, if there is still no hero and no `visual_gap_reason`, the
  write is rejected (`400`). If a hero exists but fewer than 2 distinct promo
  images survived fetch, the write is rejected unless `visual_gap_reason` is
  present. A documented gap writes `source_metadata.visual_gap` with
  `covers: ["hero","promo"]` or `covers: ["promo"]`. Review evaluate /
  publish still holds any draft with an empty `image_url` — `visual_gap`
  never waives a missing hero (promo-only exception below).
- Source/promo images are fetched only after an SSRF-safe public-URL check,
  then uploaded like other import utils. AI imagery must be disclosed in alt
  and caption (the API fills the AGENTS.md disclosure if the caller omitted it).
- Response: `{ id, slug, status, created, updated, duplicate }`.

Example (enough distinct images for hero + 2 promo):

```json
{
  "title": "Sunset hike Langbiang",
  "description": "Canonical facts from source:\n20 Sep 19:00 at Langbiang, Đà Lạt.",
  "date": "2026-09-20",
  "time": "19:00",
  "location_name": "Langbiang, Đà Lạt",
  "source_url": "https://ticketbox.vn/event/sunset-hike",
  "source_platform": "scout",
  "source_locale": "vi",
  "source_image_urls": [
    "https://ticketbox.vn/media/cover.jpg",
    "https://ticketbox.vn/media/crowd.jpg",
    "https://ticketbox.vn/media/trail.jpg"
  ]
}
```

Single real image plus a documented promo shortfall (no invented gallery):

```json
{
  "title": "Sunset hike Langbiang",
  "description": "Canonical facts from source:\n20 Sep 19:00 at Langbiang, Đà Lạt.",
  "date": "2026-09-20",
  "time": "19:00",
  "location_name": "Langbiang, Đà Lạt",
  "source_url": "https://ticketbox.vn/event/sunset-hike",
  "source_image_urls": ["https://ticketbox.vn/media/cover.jpg"],
  "visual_gap_reason": "Organizer posted only one reusable image"
}
```

## Dalat Review — `POST /api/import/review`

```
Authorization: Bearer <REVIEW_INGEST_KEY>
Content-Type: application/json
```

Body:

```
{
  "action": "evaluate" | "publish" | "qa" | "reject",
  "id"?: "<uuid>",
  "slug"?: "<slug>",
  "reasons"?: ["…"]   // required when action is reject; 1–20 non-empty strings
}
```

### `evaluate` / `publish`

Deterministic checks (no generated facts):

- title, description, `starts_at`, venue/location
- persisted `source_url` or WhatsApp `whatsapp:<jid>/<messageId>` provenance
- Đà Lạt / Lâm Đồng locality heuristics on stored text
- not a duplicate of another **published** title+date
- inside the 45-day horizon
- hero image required (`image_url`); a documented `source_metadata.visual_gap`
  never waives a missing hero — even when `covers` includes `hero`
- promo gallery 2–4 items, **or** a documented `source_metadata.visual_gap`
  covering `promo` when a hero already exists (same promo-only exception as QA)
- not an Activity Graph row

Factual holds (locality, horizon, duplicate, source provenance) are unchanged.

`publish` sets `status=published` only when every check passes. It then:

- persists a real `source_locale` when a cheap script hint can set one
  (Vietnamese-unique letters → `vi` after ignoring Đà Lạt / Lâm Đồng place
  names; Scout payload / WhatsApp `vi` kept as-is). English copy that only
  mentions the city stays null for the worker to detectLanguage.
  Null `source_locale` blocks every locale in QA / indexing readiness.
- writes `source_metadata.translation_needed_at` (ISO) and bumps `updated_at`.
  That stamp is the durable retry queue for `/api/cron/translate-events`.
- awaits `triggerTranslationServer`, which schedules Vercel `after()`
  translation for this one event. Review does **not** write locale strings.

Translation of a **draft** is not triggered at scout ingest — WhatsApp drafts
share the Review publish hook. A scout re-post of an already **published**
row schedules the same Vercel translation (and sets `translation_needed_at`
when that stamp is missing). Failures leave a new row as `draft`, do not
call translation, and return `{ passed: false, reasons: [...] }`.

### Event translation (Vercel, not the Mac mini)

Published events get title + description for every non-source locale
(`en vi ko zh ru fr ja ms th de es id`, minus `source_locale`) without
waiting on the Mac mini worker.

- **On publish:** Review `publish`, a scout re-post of a published row, and
  Activity Graph auto-publish call `schedulePublishedEventTranslation`.
  `after()` fills only missing locales for that event. The call is
  idempotent: non-blank `content_translations` rows are left in place
  (`ignoreDuplicates`, so a human-owned row is not overwritten).
- **Cron:** `GET /api/cron/translate-events` every 10 minutes
  (`vercel.json`). Auth is the existing `CRON_SECRET` bearer, same as the
  other crons. No new secret and no new provider key.
- **Provider:** `lib/google-translate.ts` → `lib/ai/provider.ts`
  (local Ollama → Cloudflare Workers AI → OpenRouter free models →
  OpenAI `gpt-4.1-mini` → Anthropic). OpenAI and Anthropic are the
  production safety net already configured on Vercel. A dead provider
  (Cloudflare 408, removed OpenRouter model) is skipped for 10 minutes
  inside the process instead of stalling the sweep. The dead OpenRouter
  free qwen model is not in the chain.
- **Selection:** published rows with `translation_needed_at`, plus published
  events that start today or later in Asia/Ho_Chi_Minh (so a same-day event
  stays eligible after it begins). Soonest start first. Older flagged rows
  run only after that window. Batch size defaults to 3 events. Blog and
  moment jobs are not loaded.
- **Done:** `translation_needed_at` is removed only when `source_locale` is
  a real content locale and every non-source locale has non-blank title and
  description. A partial failure leaves the stamp set for the next cron.

The Mac mini worker (`scripts/backfill-translations-ai.ts`) may still
translate events, but it is not the source of truth. It drains events before
blogs and skips dead providers. Do not wait on it for a scout publish.

### `reject`

Holds a draft without inventing a human UI. Requires `reasons: string[]`.

- `status` stays `draft`
- `source_metadata.review_result = "rejected"`
- `source_metadata.needs_review = false` (drops off the Review poll)
- `source_metadata.rejected_at` and `source_metadata.reject_reasons` are stored
- Response: `{ action: "reject", rejected: true, reasons: [{ message }], event }`
- Refuses non-drafts (`rejected: false`, `code: "not_a_draft"`)

Use this when evaluate passed but the listing must not go live (wrong city
night time, near-dupe, etc.). Scout can re-POST the same `source_url` to
re-open the draft.

### `qa`

After publish. Reports only — does not write translations or images.

- 12 locales from `lib/types` / `messages/*.json` (`en vi ko zh ru fr ja ms th de es id`)
- title + description completeness via `evaluateEventIndexingReadiness`
- hero present; promo gallery 2–4 items; AI disclosure if `visual_provenance=ai_generated`
- **documented promo exception (evaluate and QA):** when a hero exists and
  `visual_gap` covers `promo`, `missing_promo` is not a failing image gap
  (do not invent images). A documented gap with no hero still fails evaluate
  (`missing_image`) and QA (`missing_hero` + `documented_visual_gap`).
  `visual_gap` is a promo-only exception; it never waives a missing hero.

Immediately after publish, `readyLocales` may still be empty for a few
minutes while the Vercel `after()` job or the 10-minute cron writes locale
rows. Re-run `qa` after that; `translations.passed` is true only when every
non-source locale has substantive title + description. Image checks are
independent.

Poll drafts instead of (or in addition to) the WhatsApp hook:

```
events?status=eq.draft&source_metadata->>needs_review=eq.true
```

Typical Review loop: poll → `evaluate` → `reject` (structured reasons) **or**
fix fact/image gaps → `publish` (writes `translation_needed_at` and schedules
Vercel translation) → `qa` → if locales are still missing, wait for the
10-minute cron (or the in-flight `after()` job) → `qa` again.
Review never invents locale strings or images.

`EVENT_IDS=` on the Mac mini is only a manual repair. The Vercel path does
not need it.

One-off repair (uses stored title/description; do not invent copy):

```bash
cd ~/dalat-app-seo-worker
EVENT_IDS=<event-uuid> npx tsx --tsconfig tsconfig.json scripts/backfill-translations-ai.ts
```

## WhatsApp service

Runnable Go listener in `whatsapp-ingest/`. Mac mini launchd runbook and env
table live in that README. The process must stay read-only on WhatsApp.

WhatsApp drafts often have a single flyer. Review evaluate will hold them
(`missing_promo`) until Scout re-submits 3 distinct images, or a hero plus
`visual_gap_reason` covering promo, or Review `reject`s with reasons. A
documented gap never waives a missing hero. Do not invent promo images.

## Related code

- Draft default for legacy admin import: `lib/import/import-config.ts`
- Shared writer (gov/articles): `lib/import/import-events.ts`
- Horizon / visual truth: `AGENTS.md`
