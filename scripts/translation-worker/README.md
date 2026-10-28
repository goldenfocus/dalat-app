# Subscription translation worker

The app keeps the source text. `lib/translations/registry.ts` declares every public text family and its visibility filters. This worker pages through *all* source rows and all translation rows; no newest-200/1000 limit. It uses local authenticated subscription CLIs, not API keys:

- Translator: `claude --model sonnet --effort high`, no tools, ephemeral session.
- Independent reviewer: `codex exec -m gpt-6.1-sol -c model_reasoning_effort=high`, read-only, no tools, ephemeral session.
- Originals are byte-preserved; names, URLs, prices, dates, attribution and structured source metadata are not rewritten.
- No model fallback silently downgrades quality. Invalid/incomplete JSON, altered structure or unavailable models leave work pending. Each CLI output is constrained to exact locale, field and record keys. Completed fields are omitted from translation requests; full source snapshots still guard every write. Mixed-language machine metadata is translated field by field, without copying all fields into a presumed single source language. Source languages outside the 12 targets use `und`, requiring all 12 target translations; Experiences retain their author-selected locale to satisfy the editor schema. Source language is detected afresh and independently checked after every text revision. Source is checked before and after each write. Human-owned rows are never overwritten.
- Content is read using anonymous RLS. Exceptions: published event recaps are storage drafts with `recap_published_at`, a visible published event, and only their public narrative fields selected; technical draft notes are excluded. People: authenticated-only discovery copy is read with the same enabled/non-private/non-ghost gate as the existing People worker. No unpublished drafts, blocked-account discovery expansion, or private profiles go to the CLIs.
- AI-reviewed rows remain `translation_status=auto`. `ai_reviewed_at`, `translator_model`, and `reviewer_model` provide provenance without falsely claiming human review.

## Run and audit

Run from a clean app checkout with dependencies and `.env.local` containing existing Supabase environment values. Keys stay in the parent process; CLI child environments strip provider API keys. Never put keys or content in command-line arguments.

```sh
scripts/translation-worker/install.sh # macOS launchd, after both CLIs are signed in
npx tsx scripts/translation-worker/worker.ts --audit
npx tsx scripts/translation-worker/worker.ts --loop
npx tsx scripts/translation-worker/ui-catalogs.ts
node scripts/check-translation-catalogs.mjs
```

The local `.translation-worker/` directory is ignored by git. `latest-report.json` records per-table coverage and errors; `heartbeat.json` records progress; per-content receipts retain reviewed outputs. Receipts contain source text and must not be uploaded or committed. `--audit` makes no database changes.

Optional environment controls:

- `TRANSLATION_TYPES=venue,organizer,...`: restrict a repair/audit.
- `TRANSLATION_CONTENT_ID=<uuid>`: one-content repair.
- `TRANSLATION_REVIEW_EXISTING=1`: intentionally review existing automatic rows too; preserves human edits.
- `TRANSLATION_REVIEW_AFTER=<ISO timestamp>`: also review newly written rows from other providers. Set when installing the worker so the Vercel event fast path receives independent review.
- `TRANSLATION_ITEMS_PER_TYPE=20`: fair per-round processing, preventing long transcripts from starving new content. Full coverage is audited even when writes are bounded.
- `TRANSLATION_MAX_ITEMS=4`: bounded smoke test.
- `TRANSLATION_STATE_DIR`: separate output directory for a parallel audit or targeted repair.

The worker uses two batch lanes, splitting long records into smaller locale groups. Failures are reported and retried in subsequent rounds. Do not report complete based on a startup, heartbeat, or first batch: run a fresh audit and verify *zero* missing fields, no stale human rows, no failures, and actual localized public routes.

Native menu overrides carry per-locale `*_i18n_sources` JSON bindings. A source edit preserves editor JSON for recovery but hides each locale until its current source is re-reviewed; the worker fills missing current-source locales. Migration `20261119_001_menu_locale_source_bindings.sql` supersedes the earlier scalar binding, so reviewing one language cannot revive another language’s stale text.

## Durable source updates

Migrations `20261115_001_translation_coverage.sql` and `20261116_001_translation_review_provenance.sql` expand the shared translation store and install database invalidation. Any source edit—admin, organizer, import, CLI, or future route—removes automatic translations in the same transaction. Human edits survive as `is_stale=true` and are excluded by read RLS until re-reviewed. Source deletion removes translations. Migration `20261121_001_moment_metadata_labels.sql` extends invalidation to public AI tags, objects, location hints, mood and OCR text, stored as one ordered `tags` JSON string array; original labels remain available in the UI. Hex colors and model diagnostics remain source data. Migration `20261120_001_translation_source_visibility.sql` also binds translation read access to the current source visibility. The SQL regression fixture is `supabase/tests/translation-coverage.sql` and rolls back its test data.

Do not disable the legacy Mac mini worker until a replacement has actually written a reviewed batch. Its old logs are not evidence of current coverage. Preserve the old job configuration so it can be restored. A new machine needs its own CLI sign-in; never copy subscription credentials between machines.

## UI and new features

Use the `Languages` icon everywhere:

- `OriginalText` for server-rendered text and content blocks.
- `TranslatedContent` for live client text; it keeps the source and toggles in place.
- `TranslatedFrom` delegates original access to the shared control.

Every new text field, game, feature, or content type must include: a registry entry and public visibility rule, valid DB content/field constraints, source-change invalidation, localized server metadata and page content, original access, complete UI catalogs, and a production coverage check. Preserve official venue/community/organizer names. Do not rely on a browser callback to queue translations.

The existing Vercel event translation path remains available for fast event publication; the subscription worker reviews new output after `TRANSLATION_REVIEW_AFTER`. The local worker never sends Telegram progress messages. Provider outages back off for 15 minutes; they never silently downgrade to an unreviewed model. For a deliberate human re-review, verify the current source and update the reviewed row with `is_stale=false`; do not unhide an old review without checking its source.
