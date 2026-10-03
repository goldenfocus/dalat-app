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
   - Native WhatsApp event messages, invites, edits, and cancellations →
     structured title, description, start/end, location name/address,
     coordinates, and join link. Edits and revokes update the original
     message's draft (`wa-<original id>`). `isCanceled` becomes
     `status: cancelled`.
   - whatsmeow does **not** expose a group or community event-list RPC.
     On history sync the daemon backfills native event messages in
     allowlisted groups (still inside the 45-day horizon). It does not
     replay ordinary chat, and it does not render screenshots. A PDF flyer
     is caption-only: rendering would be the only way to read the page,
     and this process does not render.
   - Text uses a day-first parser for English and Vietnamese: month names
     (`October 3`, `3rd of October`), `ngày 3 tháng 10`, weekdays
     (`this Saturday`, `thứ bảy`, `WEEKLY SATURDAY`), and relative days
     (`tonight`, `tomorrow`, `tối nay`) in Asia/Ho_Chi_Minh. A missing
     clock is midnight, except tonight/tối nay which uses 20:00, and is
     flagged `time_inferred`.
   - Chit-chat (`yes`, `thank you`, `where do you sit?`) and short personal
     meal plans (`Lunch / Cơm tấm Nguyễn` plus a time) are skipped. They
     never call the model.
   - Every image in an allowlisted group, including image-only posts, is
     downloaded and sent to a vision model when a key is configured. The
     model may supply a title, date, venue, price, or organizer only from
     text it can see. A venue that is not in the conversation is dropped
     unless `from_image` is set.
   - The last 40 messages or two hours per group (replies included) are
     kept in memory. A flyer followed by "tomorrow 8pm at Cù Rú", or a
     reply to "can you repost the location?", updates the original draft
     instead of inserting another row.
   - Venue cues already in the text (`Location:`, `tại …`, `at …`) are
     copied; missing places stay empty — the bot never invents Đà Lạt.
   - Flyer images are uploaded to the public `event-media` bucket under
     `whatsapp/`. A single flyer sets `source_metadata.visual_gap` covering
     `promo` so Review can waive the gallery. It does not waive a missing
     hero. The description records which group in the Life in Đà Lạt
     community shared it.
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
| `OPENAI_API_KEY` | Vision/text extraction. Same key as `lib/ai/provider.ts`. Tried first. |
| `ANTHROPIC_API_KEY` | Fallback vision/text provider (`claude-sonnet-4-20250514`). |
| `OPENROUTER_API_KEY` | Fallback vision/text provider (`google/gemini-2.5-flash-lite`). |
| `WHATSAPP_EVENT_MODEL` | Optional model override for whichever provider answers. |
| `WHATSAPP_EVENT_LLM` | Optional `openai`, `anthropic`, `openrouter`, or `off`. Default: try the three keys above. |

No new key is required. The daemon reads `../.env.local`, so an `OPENAI_API_KEY`
already used by the app is enough. Without any key, text dates still parse and
flyer images that do not contain a date in the caption are skipped.

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

### Pair with a phone-number code (no QR)

```sh
./whatsapp-ingest pair --phone 84123456789   # E.164 digits
```

Prints `PAIRING CODE: XXXX-XXXX`. On the bot phone: WhatsApp → Linked devices →
Link a device → *Link with phone number instead*, enter the code. The process
waits up to 10 minutes, prints a fresh code if the connection drops, then saves
the session to `store.db` and exits. If you run it in the background, start it
in its own session (e.g. `setsid`/`start_new_session`) so it survives the shell.

### List joined groups

```sh
./whatsapp-ingest groups      # JID<TAB>name
./whatsapp-ingest groups -v   # + community parent JID and flags
```

Stop the daemon first — never run two clients on one `store.db` at once.

If WhatsApp logs the session out, move `store.db` aside and re-pair.

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
  WhatsApp event messages are exact. Model output cannot add a venue, price,
  or date that is not in the text, unless the call included a flyer image and
  the model marked the fact `from_image`.
- Date ambiguity is resolved day-first (Vietnam convention).
- Never send messages from this process (`Send*` APIs are unused on purpose).
- Nothing in this repo polls `needs_review`. `REVIEW_HOOK_URL` only notifies;
  it does not publish. Drafts stay drafts until Dalat Review calls
  `POST /api/import/review`. A draft still needs a venue and a hero image
  before that call can publish it. The three drafts created on 1 Oct 2026
  ("Improv Playdate", "Stand-up Comedy Workshop", "Lunch") are not published
  by this process. "Lunch / Cơm tấm Nguyễn" is treated as a personal meal
  plan when it is ordinary chat; a native WhatsApp event with that name is
  still ingested because the sender created an event.
