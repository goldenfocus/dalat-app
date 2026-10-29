# Social House Drive photo import

Source: [Socialhouse Language exchange](https://drive.google.com/drive/folders/1Gwkv7ht3evXGMkwkT8W8E9YOZwgzDt_y).
Destination: existing published occurrences of the Social House language-exchange series only (`ad0a0c5e-f718-447c-89f1-6fa3b78e3c52` at venue `436f8b46-d5fe-41ef-8245-e8ffb9ee7980`). This source does not import unrelated Social House activities or create events.

## Team workflow

Upload the photos to a subfolder named `2026-10-28 Language Exchange` (replace the date for each event). Nested camera/export folders are fine. `28.10.2026` and `20261028` also work; a full year is required. Ambiguous dates such as `01/02/2026` are held; use `2026-02-01` instead. Keep each event in its own dated folder. Existing camera capture timestamps are an alternative when there is no date in the folder or filename. If camera dates are wrong, correct/remove the metadata before uploading: conflicting evidence is deliberately held, not guessed.

The scheduled endpoint checks every 30 minutes. Full scans are due every 30 minutes during the week after an event, and daily otherwise, so late additions remain discoverable. There is no inferred “all photos arrived” state. A two-minute settle delay avoids importing files still changing. Each run imports up to 12 photos and continues on later runs. JPEG, PNG, WebP, HEIC and HEIF are accepted; videos and Drive shortcuts are ignored. Files over 30 MB or images exceeding 80 million pixels are held/failed for review.

Photos appear in the existing event Moments album under the event creator's account. The public copy is a correctly oriented JPEG up to 2400 pixels; its thumbnail is up to 480 pixels. Embedded metadata, including GPS, is stripped. Originals in Drive are never changed. No captions, invented descriptions, event covers or promo galleries are generated/replaced.

## Enable the connection

1. Apply `supabase/migrations/20261126_001_drive_photo_sync.sql` through the normal migration process.
2. Enable **Google Drive API** in the Google Cloud project used by the server API key. The already-tested app key belongs to project `757679439008`; its Drive API was disabled at implementation time.
3. Set `GOOGLE_DRIVE_API_KEY` in production to a server key that permits the Drive API and has appropriate server restrictions. Do not use the browser Maps key: its HTTP-referrer restriction prevents server requests. Do not paste keys into logs, chat, or source control.
4. Deploy/redeploy with that environment setting. Trigger authenticated `GET /api/cron/sync-drive-photos` using the existing cron secret and verify `state: complete`, then inspect the first real upload in its event album. An empty-folder success verifies access, not photo import.

The source folder must remain readable by anyone with its link. No Google OAuth grant or account-wide private Drive access is used. Removing public access fails closed. If the team later wants a private folder, implement a separate folder-scoped service-account connection rather than silently broadening access.

Without `GOOGLE_DRIVE_API_KEY`, the route returns `setup_required` and performs no external reads or database writes. Unauthorized requests return 401. Google/provider errors return 502, distinct from a successful empty-folder scan.

## Matching, retries and provenance

Every complete date in ancestor folders, filename and capture metadata must agree. Capture timestamps with no timezone are interpreted in `Asia/Ho_Chi_Minh`. Drive creation/upload/modification dates are **never** used as the event date. Exactly one published event in the configured venue and series must match and have ended. Private, cancelled, ambiguous, still-running and moderation-required events are held.

The database lease serializes overlapping scans. Deterministic moment IDs recover from crashes after publication; original-file SHA-256 catches identical copies in the same event. Once imported, modified sources are held for review, never silently moved or replaced. Deleting a Drive file does not delete an album photo. Removing/moderating an imported album photo does not cause it to reappear on the next scan.

`drive_photo_imports` records source file URL, folder path, fingerprint, destination event/moment and outcome. `drive_photo_sync_state` records the latest run and next due time. Both are service-role-only, not public. Held/failed items are retried fairly, and newly arrived files go first. Review records through the authenticated database console; no Telegram messages are sent.

```sql
select source_id, last_scan_at, next_scan_at, last_report
from public.drive_photo_sync_state;

select source_url, source_path, status, reason, event_id, moment_id
from public.drive_photo_imports
where status in ('held', 'failed')
order by checked_at desc;
```

API contracts: [Google files.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list), [file metadata](https://developers.google.com/workspace/drive/api/reference/rest/v3/files), [blob downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads).
