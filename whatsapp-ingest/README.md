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
     On an automatic history sync the daemon backfills native event
     messages in allowlisted groups (still inside the 45-day horizon).
     Ordinary chat from before the daemon connected is replayed only by
     the explicit backfill below. It does not render screenshots. A PDF flyer
     is caption-only: rendering would be the only way to read the page,
     and this process does not render.
   - Text uses a day-first parser for English and Vietnamese: month names
     (`October 3`, `3rd of October`), `ngày 3 tháng 10`, weekdays
     (`this Saturday`, `thứ bảy`, `WEEKLY SATURDAY`), and relative days
     (`tonight`, `tomorrow`, `tối nay`) in Asia/Ho_Chi_Minh, resolved
     against the message time. The date and the clock may come from
     different sources: the caption first, then a flyer's readable text
     ("Tomorrow" + "FRI OCT 9 FROM 6PM" is tomorrow 18:00, firm). Clocks:
     `6PM`, `6 PM`, `8 p.m.`, `6:30pm`, `18:00`, `18h`, `18h30`, `từ 18h`,
     `8 giờ tối`; ranges (`6pm–10pm`, `6-10pm`, `18h-22h`,
     `10:00–11:30 AM`) set the end. Only when no clock exists anywhere is
     the start midnight (tonight/tối nay: 20:00) and flagged
     `time_inferred`.
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
   - Venues come only from text: a `Venue:` / `Location:` / `Địa điểm:` /
     `📍` line, a capitalised name after `at` / `tại` ("at the Socialhouse"),
     the model's `venue_name` / `street_address` when they appear in the
     caption or the flyer's readable text, or a Google Maps link. Names are
     normalized (no emoji, leading "the", trailing punctuation/filler) and
     must look like a place name — description fragments are dropped and the
     venue stays empty rather than guessed. The address is the parsed street
     address plus Đà Lạt / Lâm Đồng; `google_maps_url` is a search for the
     clean name + address. A name that matches a `venues` row (normalized,
     ignoring a trailing "Dalat") links `venue_id`.
   - No draft is created unless the caption or flyer text states a clock
     time, a calendar date, or today/tonight/tomorrow. A bare weekday
     ("the Saturday coffee meetup") is not enough.
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
| `IMPORT_CREATED_BY` | Profile UUID owning the drafts (default: resolves username `yan`). Production uses the `lifeindalat` service profile so events never show a person as creator. |
| `IMPORT_ORGANIZER_ID` | Optional `organizers.id` credited on every draft (production: the Life in Dalat organizer, slug `lifeindalat`) |
| `WHATSAPP_GROUP_JIDS` | Comma-separated group JID allowlist. **Empty = discovery mode**: logs every group message with its JID, ingests nothing. |
| `REVIEW_HOOK_URL` | Optional notify URL after a draft upsert. Do **not** point this at `/api/import/review`. |
| `REVIEW_INGEST_KEY` | Optional Bearer for `REVIEW_HOOK_URL` |
| `OPENAI_API_KEY` | Vision/text extraction. Same key as `lib/ai/provider.ts`. Tried first. |
| `ANTHROPIC_API_KEY` | Fallback vision/text provider (`claude-sonnet-4-20250514`). |
| `OPENROUTER_API_KEY` | Fallback vision/text provider (`google/gemini-2.5-flash-lite`). |
| `WHATSAPP_EVENT_MODEL` | Optional model override for whichever provider answers. |
| `WHATSAPP_EVENT_LLM` | Optional `openai`, `anthropic`, `openrouter`, or `off`. Default: try the three keys above. |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | Flyer upload. Same R2 token Scout uses. Required for a hero. |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 secret for that token. |
| `CLOUDFLARE_R2_ENDPOINT` | R2 S3 endpoint. |
| `CLOUDFLARE_R2_PUBLIC_URL` | Public CDN origin, `https://cdn.dalat.app`. |
| `CLOUDFLARE_R2_BUCKET_NAME` | Optional. Default `dalat-app-media`. |

The daemon reads `../.env.local`. An `OPENAI_API_KEY` the app already has is
enough for vision. Flyer bytes are stored at
`{CLOUDFLARE_R2_PUBLIC_URL}/event-media/{slug}/{timestamp}.ext`, the same path
Scout writes, with `source_metadata.visual_provenance=owner_authorized_source`.
Without R2, a message that needs a hero is skipped. Without an LLM key, text
dates still parse and flyer images that do not contain a date in the caption
are skipped.

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

## History backfill

WhatsApp keeps history on the paired phone only, so the backfill asks the
phone for it (whatsmeow on-demand history sync: `BuildHistorySyncRequest` +
`SendPeerMessage`, answered as an `ON_DEMAND` `events.HistorySync`). It walks
each allowlisted group backwards 50 messages at a time from the newest known
message until it passes `-since`, then replays everything oldest-first through
the live pipeline: flyer vision, the per-group context window (on the
message's own clock, so "tomorrow" means the day after it was sent), the R2
hero, the needs_review gate, and the idempotent `wa-<message id>` slug. Past
events are still skipped by the 45-day horizon; nothing is published.

The phone must be online. Only one client may use `store.db`, so stop the
launchd job while the one-shot runs:

```bash
launchctl bootout gui/$(id -u)/app.dalat.whatsapp-ingest
./whatsapp-ingest backfill -since 2026-09-25 -dry-run   # list only
./whatsapp-ingest backfill -since 2026-09-25 [-until 2026-10-03T02:07:00-04:00]
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/app.dalat.whatsapp-ingest.plist
```

`-since`/`-until` take `2026-09-25` (midnight Đà Lạt), `2026-09-25T08:00`
(Đà Lạt clock) or RFC 3339. Other flags: `-page`, `-max-pages`, `-wait`,
`-phone-wait 12h` (keep re-asking a silent phone every `-probe-every`,
default 15m).

Alternatively set `WHATSAPP_BACKFILL_SINCE` (and preferably
`WHATSAPP_BACKFILL_UNTIL`) in the launchd job. The daemon then runs one
backfill after connecting and keeps listening. If the phone is silent, it
re-probes every 15 minutes for `WHATSAPP_BACKFILL_PHONE_WAIT` (default 24h).
A finished run is recorded in `backfill-state.json`, so restarts do not replay
it. Delete that file to run it again. The run ends with a `backfill done:` summary
line plus one line per created/updated draft.

The first request in a group starts before the newest live message the
daemon saw (kept in `backfill-anchors.json`), or else before the newest
message id in `store.db`'s message-secret table.

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
  `POST /api/import/review`. A draft is saved with `needs_review` only when
  it has a hero, a public venue, a firm date, and Đà Lạt / Lâm Đồng on the
  address. "Lunch 12:15" plus a maps link, "DM for location", and a date the
  message calls tentative are skipped. Re-sending the same message id or
  source URL reopens a rejected draft.
