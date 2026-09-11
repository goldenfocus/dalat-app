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

Optional: `ends_at`, `address`, `google_maps_url`, `source_platform` (not
`activity-graph`), `source_locale` (Vietnamese-unique letters infer `vi` when
omitted, ignoring Đà Lạt / Lâm Đồng place names), `source_image_urls[]`, `promo_image_urls[]`,
`visual_provenance` (`owner_authorized_source` \| `ai_generated`), `image_alt`,
`image_caption`, `visual_gap_reason`, `organizer_name`.

Behavior:

- Re-posts of the same canonical `source_url` do not create a second row.
- Past events and starts more than 45 days out are rejected (`422`).
- Source/promo images are fetched only after an SSRF-safe public-URL check,
  then uploaded like other import utils. AI imagery must be disclosed in alt
  and caption (the API fills the AGENTS.md disclosure if the caller omitted it).
- Response: `{ id, slug, status, created, updated, duplicate }`.

Example:

```json
{
  "title": "Sunset hike Langbiang",
  "description": "Canonical facts from source:\n20 Sep 19:00 at Langbiang, Đà Lạt.",
  "date": "2026-09-20",
  "time": "19:00",
  "location_name": "Langbiang, Đà Lạt",
  "source_url": "https://ticketbox.vn/event/sunset-hike",
  "source_platform": "scout",
  "source_image_urls": ["https://ticketbox.vn/media/cover.jpg"]
}
```

## Dalat Review — `POST /api/import/review`

```
Authorization: Bearer <REVIEW_INGEST_KEY>
Content-Type: application/json
```

Body: `{ "action": "evaluate" | "publish" | "qa", "id"?: "<uuid>", "slug"?: "<slug>" }`.

### `evaluate` / `publish`

Deterministic checks (no generated facts):

- title, description, `starts_at`, venue/location
- persisted `source_url` or WhatsApp `whatsapp:<jid>/<messageId>` provenance
- Đà Lạt / Lâm Đồng locality heuristics on stored text
- not a duplicate of another **published** title+date
- inside the 45-day horizon
- hero image **or** a documented `source_metadata.visual_gap`
- not an Activity Graph row

`publish` sets `status=published` only when every check passes. It then:

- persists a real `source_locale` when a cheap script hint can set one
  (Vietnamese-unique letters → `vi` after ignoring Đà Lạt / Lâm Đồng place
  names; Scout payload / WhatsApp `vi` kept as-is). English copy that only
  mentions the city stays null for the worker to detectLanguage.
  Null `source_locale` blocks every locale in QA / indexing readiness.
- bumps `updated_at` so `lib/translation-sweep.ts` can see the row among
  recently updated **published** events (newest-`created_at` alone misses
  old scout/WhatsApp drafts).
- awaits `triggerTranslationServer` (Luma/Facebook compatibility shim; it
  logs only). Review does **not** write locale strings.

The durable enqueue the Mac mini worker cannot miss is: published row +
missing `content_translations` + recent `updated_at`. The worker drains
**events before blogs** (`partitionSweepWork`) so Cloudflare/OpenRouter blog
failures cannot starve a Review publish, and `EVENT_IDS=` skips the blog
scan entirely. Translation is **not** triggered at scout ingest — WhatsApp
drafts share this publish hook, and a draft-time call would race if the shim
later invalidates rows. Failures leave the row as `draft`, do not call
translation, and return `{ passed: false, reasons: [...] }`.

### `qa`

After publish. Reports only — does not write translations or images.

- 12 locales from `lib/types` / `messages/*.json` (`en vi ko zh ru fr ja ms th de es id`)
- title + description completeness via `evaluateEventIndexingReadiness`
- hero present; promo gallery 2–4 items; AI disclosure if `visual_provenance=ai_generated`

Immediately after publish, `readyLocales` may still be empty until the Mac
mini worker writes locale rows. Re-run `qa` after the worker sweep;
`translations.passed` is true only when every non-source locale has
substantive title + description. Image checks are independent.

Poll drafts instead of (or in addition to) the WhatsApp hook:

```
events?status=eq.draft&source_metadata->>needs_review=eq.true
```

Typical Review loop: poll → `evaluate` → fix fact/image gaps → `publish`
(durable enqueue) → `qa` → wait for the Mac mini worker if locales are
still missing → `qa` again. Review never invents locale strings.

One-off repair (uses stored title/description; do not invent copy):

```bash
cd ~/dalat-app-seo-worker
EVENT_IDS=<event-uuid> npx tsx --tsconfig tsconfig.json scripts/backfill-translations-ai.ts
```

## WhatsApp service

Runnable Go listener in `whatsapp-ingest/`. Mac mini launchd runbook and env
table live in that README. The process must stay read-only on WhatsApp.

## Related code

- Draft default for legacy admin import: `lib/import/import-config.ts`
- Shared writer (gov/articles): `lib/import/import-events.ts`
- Horizon / visual truth: `AGENTS.md`
