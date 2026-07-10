import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { notify } from '@/lib/notifications';
import type { NotificationPayload } from '@/lib/notifications/types';
import type { Locale } from '@/lib/types';

export const maxDuration = 300;

/**
 * Delivers due rows from scheduled_notifications (event reminders,
 * confirmation nudges, feedback asks, secret address reveals).
 *
 * Runs every 5 minutes via Vercel cron (see vercel.json). Idempotent:
 * rows are claimed by flipping status pending → processing, so overlapping
 * runs won't double-send. Rows stuck in 'processing' (crash/timeout mid-run)
 * are reclaimed after 15 minutes.
 *
 * Error semantics:
 * - Transient failure (query error, all sends failed) → row goes back to
 *   'pending' so the next run retries; gives up ('failed') once the row is
 *   more than 24h overdue.
 * - Target genuinely gone (event unpublished, address removed) → 'cancelled'.
 */

const RECLAIM_AFTER_MS = 15 * 60 * 1000;
const GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000;

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/** Thrown for transient failures that should be retried on the next run. */
class RetryableError extends Error {}

/**
 * Secret address reveal: one scheduled row per EVENT (created by the
 * schedule_address_reveal DB trigger). The going roster and the address are
 * resolved HERE, at send time — so waitlist promotions, cancellations, and
 * address edits between scheduling and sending are all naturally correct.
 */
async function sendAddressReveal(
  supabase: SupabaseClient,
  eventId: string
): Promise<{ skipped?: boolean; reason?: string; sent?: number }> {
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, slug, title, starts_at, status, has_private_details, created_by')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError) throw new RetryableError(`events query failed: ${eventError.message}`);

  if (!event || event.status !== 'published' || !event.has_private_details) {
    return { skipped: true, reason: 'Event no longer has a secret address' };
  }

  const { data: details, error: detailsError } = await supabase
    .from('event_private_details')
    .select('address, google_maps_url, arrival_notes')
    .eq('event_id', eventId)
    .maybeSingle();

  if (detailsError) throw new RetryableError(`private details query failed: ${detailsError.message}`);

  if (!details || (!details.address && !details.google_maps_url && !details.arrival_notes)) {
    return { skipped: true, reason: 'No private details to reveal' };
  }

  const { data: goingRsvps, error: rsvpError } = await supabase
    .from('rsvps')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('status', 'going');

  if (rsvpError) throw new RetryableError(`rsvps query failed: ${rsvpError.message}`);

  const guestIds = (goingRsvps ?? [])
    .map((r) => r.user_id as string)
    .filter((id) => id !== event.created_by); // the host knows the address

  if (guestIds.length === 0) return { sent: 0 };

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, locale')
    .in('id', guestIds);
  const localeByUser = new Map(
    (profiles ?? []).map((p) => [p.id as string, p.locale as Locale])
  );

  const eventTime = new Date(event.starts_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Ho_Chi_Minh',
  });

  let sent = 0;
  for (const userId of guestIds) {
    const result = await notify({
      type: 'event_address_reveal',
      userId,
      locale: localeByUser.get(userId) || ('en' as Locale),
      eventId: event.id,
      eventSlug: event.slug,
      eventTitle: event.title,
      eventTime,
      address: details.address,
      googleMapsUrl: details.google_maps_url,
      arrivalNotes: details.arrival_notes,
    });
    if (result.success) {
      sent++;
    } else {
      console.error(`[process-notifications] Address reveal failed for user ${userId}, event ${event.slug}`);
    }
  }

  // Every guest failed → treat the whole reveal as transient and retry
  if (sent === 0) {
    throw new RetryableError(`address reveal: 0/${guestIds.length} guests reached`);
  }

  return { sent };
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[process-notifications] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    console.error('[process-notifications] Supabase client not configured');
    return NextResponse.json({ error: 'Supabase client not configured' }, { status: 503 });
  }

  const now = Date.now();
  const reclaimBefore = new Date(now - RECLAIM_AFTER_MS).toISOString();

  // Find due notifications: pending, or stuck in 'processing' since a
  // crashed/timed-out earlier run
  const { data: pendingNotifications, error: fetchError } = await supabase
    .from('scheduled_notifications')
    .select('*')
    .or(`status.eq.pending,and(status.eq.processing,updated_at.lt.${reclaimBefore})`)
    .lte('scheduled_for', new Date(now).toISOString())
    .limit(50); // Process in batches of 50

  if (fetchError) {
    console.error('[process-notifications] Error fetching:', fetchError.message);
    return NextResponse.json({ processed: 0, error: fetchError.message }, { status: 500 });
  }

  if (!pendingNotifications || pendingNotifications.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  console.log(`[process-notifications] Processing ${pendingNotifications.length} due notification(s)`);

  let processed = 0;
  let failed = 0;

  for (const scheduled of pendingNotifications) {
    try {
      // Claim the row (prevent double-send by a concurrent run)
      const { data: claimed, error: claimError } = await supabase
        .from('scheduled_notifications')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', scheduled.id)
        .eq('status', scheduled.status) // only claim from the state we saw
        .eq('updated_at', scheduled.updated_at) // optimistic lock vs concurrent runs
        .select('id');

      if (claimError) {
        console.error(`[process-notifications] Claim failed for ${scheduled.id}:`, claimError.message);
        failed++;
        continue;
      }
      if (!claimed || claimed.length === 0) continue; // another run got it

      const payload = scheduled.payload as NotificationPayload;

      // Secret address reveal: per-event row — fan out to the current
      // going roster instead of sending to a single user
      if (payload.type === 'event_address_reveal') {
        const revealResult = await sendAddressReveal(supabase, payload.eventId);
        await supabase
          .from('scheduled_notifications')
          .update(
            revealResult.skipped
              ? { status: 'cancelled', error_message: revealResult.reason }
              : { status: 'sent', sent_at: new Date().toISOString() }
          )
          .eq('id', scheduled.id);
        processed++;
        continue;
      }

      // Smart check: skip starting nudge if attendee already confirmed
      if (payload.type === 'event_starting_nudge' && 'eventId' in payload) {
        const { data: rsvp } = await supabase
          .from('rsvps')
          .select('confirmed_at')
          .eq('user_id', scheduled.user_id)
          .eq('event_id', payload.eventId)
          .eq('status', 'going')
          .maybeSingle();

        if (rsvp?.confirmed_at) {
          await supabase
            .from('scheduled_notifications')
            .update({ status: 'cancelled', error_message: 'Skipped: attendee already confirmed' })
            .eq('id', scheduled.id);
          processed++;
          continue;
        }
      }

      // Send the notification
      const notifyResult = await notify(payload);

      if (notifyResult.success) {
        const { error: sentError } = await supabase
          .from('scheduled_notifications')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', scheduled.id);
        if (sentError) {
          // Notification went out but the row is stuck in 'processing' —
          // the reaper may retry it. Log so a duplicate send is explicable.
          console.error(`[process-notifications] Sent but status update failed for ${scheduled.id}:`, sentError.message);
        }
        processed++;
      } else {
        throw new RetryableError('all notification channels failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const overdueMs = now - new Date(scheduled.scheduled_for).getTime();
      // Transient errors go back to 'pending' for the next run; give up
      // once the row is more than 24h overdue.
      const giveUp = !(err instanceof RetryableError) || overdueMs > GIVE_UP_AFTER_MS;
      console.error(
        `[process-notifications] ${giveUp ? 'FAILED' : 'Will retry'} ${scheduled.type} ${scheduled.id}:`,
        message
      );
      await supabase
        .from('scheduled_notifications')
        .update({
          status: giveUp ? 'failed' : 'pending',
          error_message: message,
        })
        .eq('id', scheduled.id);
      failed++;
    }
  }

  console.log(`[process-notifications] Processed: ${processed}, Failed: ${failed}`);

  // Non-200 on failures so Vercel cron monitoring shows red instead of green
  return NextResponse.json({ processed, failed }, { status: failed > 0 ? 500 : 200 });
}
