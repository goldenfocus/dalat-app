# whatsapp-ingest

Listens to allowlisted WhatsApp groups via the WhatsApp Web multidevice
protocol ([whatsmeow](https://github.com/tulir/whatsmeow)) and turns event
announcements into **draft** events in the dalat.app database. Drafts are owned
by the import profile and invisible to the public until reviewed and published
through the normal app UI.

The bot is strictly read-only — it never sends messages, which keeps the
account's ban risk low. Use a dedicated phone number (burner SIM), never a
personal account.

## How it works

1. Pairs as a linked device of the bot's WhatsApp account (QR scan once;
   session persists in `store.db`).
2. Watches incoming group messages. Only messages from groups listed in
   `WHATSAPP_GROUP_JIDS` are ingested; everything else is ignored.
3. Extracts event data:
   - Native WhatsApp event messages → structured title/time/location directly.
   - Text and flyer captions → heuristic day-first date/time extraction
     (`15/9 19h00`, `03/09 at 7am`, …). Messages with no date are skipped.
   - Flyer images are downloaded and uploaded to the public `event-media`
     storage bucket under `whatsapp/`, with organizer attribution in
     `image_alt` and `source_metadata`.
4. Skips events in the past or more than 45 days out (repo discovery-horizon
   rule), and messages older than 24 h (replayed backlog).
5. Upserts a draft row into `events` (idempotent on `slug = wa-<messageID>`)
   via PostgREST with the service role key — same write path as the repo's
   import-worker. Provenance is recorded in `source_platform: 'whatsapp'` and
   `source_metadata` (group JID/name, sender, message ID, shared-at,
   time-inferred flag).

## Config

Read from the environment, falling back to `../.env.local` (override the path
with `DOTENV_PATH`):

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (required) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (required) |
| `IMPORT_CREATED_BY` | Profile UUID owning the drafts (default: resolves username `yan`) |
| `WHATSAPP_GROUP_JIDS` | Comma-separated group JID allowlist. **Empty = discovery mode**: logs every group message with its JID, ingests nothing. |

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

## First-time setup

1. Put the burner SIM in any phone, install WhatsApp, register the number.
2. Run `./whatsapp-ingest` and scan the QR code from the bot phone
   (WhatsApp → Settings → Linked devices → Link a device).
3. Add the bot number to the event groups (or join via invite links).
4. Run in discovery mode (no `WHATSAPP_GROUP_JIDS`) and watch the logs to
   collect the JIDs (`...@g.us`) of the groups you want.
5. Set `WHATSAPP_GROUP_JIDS`, restart. New announcements now land as drafts.
6. Review drafts in the app as the import-profile user and publish.

If WhatsApp logs the session out, delete `store.db` and re-pair.

## Notes & limits

- Unofficial client: the bot number can be banned. Treat it as disposable,
  keep it read-only, and make sure group admins know the bot is there.
- Heuristic date parsing can misread ambiguous text; drafts always keep the
  full original message in `description` so reviewers see the source. Native
  WhatsApp event messages are exact.
- Date ambiguity is resolved day-first (Vietnam convention).
