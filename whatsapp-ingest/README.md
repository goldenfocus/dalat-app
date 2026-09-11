# whatsapp-ingest

Listens to allowlisted WhatsApp groups via the WhatsApp Web multidevice
protocol ([whatsmeow](https://github.com/tulir/whatsmeow)) and turns event
announcements into **draft** events in the dalat.app database. Drafts are owned
by the import profile (`IMPORT_CREATED_BY`) and stay invisible until the
automated Review gate publishes them (`POST /api/import/review`).

The bot is strictly read-only — it never sends WhatsApp messages, which keeps
the account's ban risk low. Use a dedicated phone number (burner SIM), never a
personal account. Community owners have already permitted this automation.

This is the scout / WhatsApp lane. Do **not** mix these drafts into Activity
Graph auto-publish.

## How it works

1. Pairs as a linked device of the bot's WhatsApp account (QR scan once;
   session persists in `store.db`).
2. Watches incoming group messages. Only messages from groups listed in
   `WHATSAPP_GROUP_JIDS` are ingested; everything else is ignored.
3. Extracts event data:
   - Native WhatsApp event messages → structured title/time/location directly.
   - Text and flyer captions → heuristic day-first date/time extraction
     (`15/9 19h00`, `03/09 at 7am`, `12/9 20h`, …). Messages with no date are skipped.
   - Venue cues already in the text (`tại …`, `at …`) are copied; missing
     places stay empty — the bot never invents Đà Lạt.
   - Flyer images are downloaded and uploaded to the public `event-media`
     storage bucket under `whatsapp/`, with organizer attribution in
     `image_alt` and `source_metadata`.
4. Skips events in the past or more than 45 days out (repo discovery-horizon
   rule), and messages older than 24 h (replayed backlog).
5. Upserts a draft row into `events` (idempotent on `slug = wa-<messageID>`)
   via PostgREST with the service role key — same write path as the repo's
   import-worker. Provenance:
   - `source_platform: 'whatsapp'`
   - `external_chat_url: 'whatsapp:<groupJID>/<messageID>'`
   - `source_metadata.needs_review: true` (Review bot can poll this)
   - group JID/name, sender, message ID, shared-at, time-inferred flag
6. Optional: `REVIEW_HOOK_URL` receives `POST { type: "draft_ready", id, slug, … }`
   with `Authorization: Bearer <REVIEW_INGEST_KEY>` after a successful upsert.
   A hook failure is logged; the draft is kept.

## Config

Read from the environment, falling back to `../.env.local` (override the path
with `DOTENV_PATH`). See `env.example`.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (required) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (required, server-side only) |
| `IMPORT_CREATED_BY` | Profile UUID owning the drafts (default: resolves username `yan`) |
| `WHATSAPP_GROUP_JIDS` | Comma-separated group JID allowlist. **Empty = discovery mode**: logs every group message with its JID, ingests nothing. |
| `REVIEW_HOOK_URL` | Optional notify URL after a draft upsert. Do **not** point this at `/api/import/review`. |
| `REVIEW_INGEST_KEY` | Optional Bearer for `REVIEW_HOOK_URL` |

## Build & run

Go is vendored locally in `.tools/` (no system install needed):

```sh
cd whatsapp-ingest
export PATH="$PWD/.tools/go/bin:$PATH" GOPATH="$PWD/.tools/gopath" \
  GOMODCACHE="$PWD/.tools/gopath/pkg/mod"

go build -o whatsapp-ingest .
go test ./...

./whatsapp-ingest            # first run prints a QR code
```

Runtime artifacts (`whatsapp-ingest` binary, `store.db`, `.tools/`) are
gitignored. Never commit secrets.

## First-time setup

1. Put the burner SIM in any phone, install WhatsApp, register the number.
2. Run `./whatsapp-ingest` and scan the QR code from the bot phone
   (WhatsApp → Settings → Linked devices → Link a device).
3. Add the bot number to the event groups (or join via invite links).
4. Run in discovery mode (no `WHATSAPP_GROUP_JIDS`) and watch the logs to
   collect the JIDs (`...@g.us`) of the groups you want.
5. Set `WHATSAPP_GROUP_JIDS`, restart. New announcements now land as drafts
   with `needs_review: true`.
6. Dalat Review polls drafts or receives `REVIEW_HOOK_URL`, then calls
   `POST /api/import/review`. See `docs/handover/scout-review-ingest.md`.

If WhatsApp logs the session out, delete `store.db` and re-pair.

## Mac mini always-on (launchd)

Same machine pattern as `scripts/import-worker` (KeepAlive, like the cover
worker). The process must stay up — it is a live WhatsApp listener, not a cron.

```bash
# 1. Build once after each pull
cd ~/dalat-app/whatsapp-ingest
export PATH="$PWD/.tools/go/bin:$PATH" GOPATH="$PWD/.tools/gopath" \
  GOMODCACHE="$PWD/.tools/gopath/pkg/mod"
go build -o whatsapp-ingest .

# 2. Confirm .env.local in the repo root has the table above, then:
sed -e "s|__REPO_PATH__|$HOME/dalat-app|g" \
    com.dalat.whatsapp-ingest.plist \
    > ~/Library/LaunchAgents/com.dalat.whatsapp-ingest.plist
launchctl load ~/Library/LaunchAgents/com.dalat.whatsapp-ingest.plist

# 3. Logs
tail -f /tmp/dalat-whatsapp-ingest.log /tmp/dalat-whatsapp-ingest.err
```

Reload after a binary rebuild: `launchctl kickstart -k gui/$(id -u)/com.dalat.whatsapp-ingest`.

## Notes & limits

- Unofficial client: the bot number can be banned. Treat it as disposable,
  keep it read-only, and make sure group admins know the bot is there.
- Heuristic date parsing can misread ambiguous text; drafts always keep the
  full original message in `description` so Review sees the source. Native
  WhatsApp event messages are exact.
- Date ambiguity is resolved day-first (Vietnam convention).
- Never send messages from this process (`Send*` APIs are unused on purpose).
