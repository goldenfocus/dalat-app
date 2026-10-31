# Social House attendee follow-up

`/api/cron/event-followups` runs every 15 minutes. The Social House language-exchange series is enabled by the migration; events starting before that activation are excluded. Send time is 09:00 Asia/Ho_Chi_Minh on the calendar day after the event ends. Other series are disabled unless explicitly configured.

Only account-backed check-ins (RSVP `checked_in_at` or arrival participant) qualify. Cancelled/no-show RSVPs, ghost/internal accounts, unverified addresses and email opt-outs are excluded. Guest arrival records have no email address. Eligibility is checked again immediately before sending.

The localized email links to the event, album, upload form, EZViet Meet, and the next two published public events in the same series. The two review phrases come from EZViet's conversation guide; the copy does not claim an individual's learning history.

## Operations

- `GET /api/cron/event-followups?dryRun=1` with the existing cron bearer secret returns upcoming event IDs and send times without sending or claiming deliveries.
- Set `event_followup_settings.enabled=false` for the series to pause it. Keep these service-role-only tables private.
- `event_followup_deliveries` contains private receipts and frozen email payloads. Never expose it through public translations, diagnostics or client queries.
- Pending deliveries use ten-minute leases and a stable Resend idempotency key. The payload is persisted before calling Resend. Retries use exactly the same request.
- Uncertain deliveries are held as `review` after 23 hours, before Resend's 24-hour deduplication window expires. Changed recipient, source event, or promoted events also require review. Do not reset these rows and blindly resend; first verify the provider receipt.
- `last_error` contains a non-sensitive reason code. The cron response reports counts only.

## Verification

Run `npx vitest run lib/notifications/event-followup.test.ts lib/notifications/event-followup-template.test.ts`, catalog checks, and the build. `supabase/tests/event-followups.sql` is a rollback-only SQL integration check after applying the migration. It never invokes the email provider.
