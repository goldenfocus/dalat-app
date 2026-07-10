import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { notifyUserInvitation, sendEmailInvitation } from '@/lib/notifications';
import {
  isValidAudienceKey,
  resolveAudienceMembers,
  getBlastExclusions,
  subtractExclusions,
} from '@/lib/audiences/resolve';
import type { Locale, InviteQuotaCheck } from '@/lib/types';

interface InviteRequest {
  emails?: Array<{ email: string; name?: string }>;
  users?: Array<{ userId: string; username: string }>;
  /** Admin-only: audience keys ('all' or an EventTag). Each member gets a real invitation. */
  audiences?: string[];
  /** Optional human note rendered in the blast email (untranslated on purpose). */
  personalNote?: string;
}

// POST /api/events/[slug]/invitations - Send invitations
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const supabase = await createClient();
  const { slug } = await params;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Get the event by slug
  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, description, image_url, starts_at, ends_at, location_name, address, google_maps_url, created_by')
    .eq('slug', slug)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const body: InviteRequest = await request.json();
  const { emails = [], users = [], audiences = [], personalNote } = body;

  const totalInvites = emails.length + users.length;
  if (totalInvites === 0 && audiences.length === 0) {
    return NextResponse.json({ error: 'emails, users, or audiences array required' }, { status: 400 });
  }

  // Check quota before sending (audience blasts are admin-only; admins are unlimited)
  if (totalInvites > 0) {
    const { data: quotaCheck } = await supabase.rpc('check_invite_quota', {
      p_user_id: user.id,
      p_count: totalInvites,
    }) as { data: InviteQuotaCheck | null };

    if (!quotaCheck?.allowed) {
      return NextResponse.json({
        error: 'Quota exceeded',
        reason: quotaCheck?.reason,
        remaining_daily: quotaCheck?.remaining_daily,
        remaining_weekly: quotaCheck?.remaining_weekly,
      }, { status: 429 });
    }
  }

  // Get inviter profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, username, locale, role')
    .eq('id', user.id)
    .single();

  const inviterName = profile?.display_name || profile?.username || 'Someone';
  const inviterLocale = (profile?.locale as Locale) || 'en';

  // Validate the audience request BEFORE any personal invites go out — a late 4xx
  // after emails were sent makes the client retry and double-send.
  const validAudiences = audiences.filter(isValidAudienceKey);
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (audiences.length > 0) {
    if (profile?.role !== 'admin' && profile?.role !== 'superadmin') {
      return NextResponse.json({ error: 'Not authorized for audience invites' }, { status: 403 });
    }
    if (validAudiences.length !== audiences.length) {
      const invalid = audiences.filter((a) => !isValidAudienceKey(a));
      return NextResponse.json({ error: `Unknown audience: ${invalid.join(', ')}` }, { status: 400 });
    }
    if (!serviceUrl || !serviceKey) {
      return NextResponse.json({ error: 'Server not configured for audience invites' }, { status: 500 });
    }
  }

  const results: Array<{ email?: string; userId?: string; username?: string; success: boolean; error?: string; token?: string }> = [];

  // Helper to add delay between sends (Resend rate limit: 1 email/second on free tier)
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Process each email invite
  for (let i = 0; i < emails.length; i++) {
    const { email, name } = emails[i];

    // Add delay between emails to respect rate limits (skip first one)
    if (i > 0) {
      await delay(1000);
    }
    const normalizedEmail = email.toLowerCase().trim();

    // Try to create invitation record
    const { data: invitation, error: insertError } = await supabase
      .from('event_invitations')
      .insert({
        event_id: event.id,
        invited_by: user.id,
        email: normalizedEmail,
        name: name || null,
        status: 'pending',
      })
      .select('id, token, claimed_by')
      .single();

    let existingInvitation = invitation;

    // If duplicate, fetch the existing invitation to resend notification
    if (insertError) {
      if (insertError.code === '23505') {
        const { data: existing } = await supabase
          .from('event_invitations')
          .select('id, token, claimed_by')
          .eq('event_id', event.id)
          .eq('email', normalizedEmail)
          .single();

        if (existing) {
          existingInvitation = existing;
        } else {
          results.push({ email, success: false, error: 'Already invited' });
          continue;
        }
      } else {
        console.error("Invitation insert error:", insertError);
        results.push({ email, success: false, error: "Failed to create invitation" });
        continue;
      }
    }

    // Send email via Novu (works for both new and existing invitations)
    if (!existingInvitation) {
      results.push({ email, success: false, error: 'Failed to create invitation' });
      continue;
    }

    // Save to contacts
    await supabase.rpc('upsert_organizer_contact', {
      p_owner_id: user.id,
      p_email: normalizedEmail,
      p_name: name || null,
    });

    try {
      await sendEmailInvitation(normalizedEmail, {
        type: 'event_invitation',
        userId: `invite-${existingInvitation.token}`,
        locale: inviterLocale,
        inviteeEmail: normalizedEmail,
        inviteeName: name || null,
        eventTitle: event.title,
        eventSlug: event.slug,
        eventDescription: event.description,
        eventImageUrl: event.image_url,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        locationName: event.location_name,
        address: event.address,
        googleMapsUrl: event.google_maps_url,
        inviterName,
        token: existingInvitation.token,
      });

      // Update status to sent (or resent for existing invitations)
      await supabase
        .from('event_invitations')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', existingInvitation.id);

      results.push({ email, success: true, token: existingInvitation.token });
    } catch (error) {
      console.error('Failed to send invite email:', error);
      results.push({ email, success: false, error: 'Failed to send email' });
    }
  }

  // Process each user invite (existing users by username)
  for (let i = 0; i < users.length; i++) {
    const { userId, username } = users[i];

    // Add delay between notifications to respect rate limits (skip first one)
    if (i > 0) {
      await delay(1000);
    }
    // Get the invitee's profile for their locale
    const { data: inviteeProfile } = await supabase
      .from('profiles')
      .select('id, locale, display_name')
      .eq('id', userId)
      .single();

    if (!inviteeProfile) {
      results.push({ userId, username, success: false, error: 'User not found' });
      continue;
    }

    // Use a synthetic email for the unique constraint (user-based invites don't need real email)
    const syntheticEmail = `user-${userId}@dalat.app`;

    // Try to create invitation record
    const { data: invitation, error: insertError } = await supabase
      .from('event_invitations')
      .insert({
        event_id: event.id,
        invited_by: user.id,
        email: syntheticEmail,
        name: inviteeProfile.display_name || username,
        status: 'pending',
        claimed_by: userId, // Pre-link to the user
      })
      .select('id, token')
      .single();

    let existingInvitation = invitation;

    // If duplicate, fetch the existing invitation to resend notification
    if (insertError) {
      if (insertError.code === '23505') {
        const { data: existing } = await supabase
          .from('event_invitations')
          .select('id, token')
          .eq('event_id', event.id)
          .eq('email', syntheticEmail)
          .single();

        if (existing) {
          existingInvitation = existing;
        } else {
          results.push({ userId, username, success: false, error: 'Already invited' });
          continue;
        }
      } else {
        console.error("User invitation insert error:", insertError);
        results.push({ userId, username, success: false, error: "Failed to create invitation" });
        continue;
      }
    }

    // Send in-app notification (works for both new and existing invitations)
    if (!existingInvitation) {
      results.push({ userId, username, success: false, error: 'Failed to create invitation' });
      continue;
    }

    try {
      const inviteeLocale = (inviteeProfile.locale as Locale) || 'en';
      console.log('[POST /invitations] About to send notification:', {
        userId,
        inviteeLocale,
        eventTitle: event.title,
        eventSlug: event.slug,
      });

      await notifyUserInvitation(
        userId,
        inviteeLocale,
        event.title,
        event.slug,
        event.starts_at,
        event.location_name,
        inviterName
      );

      console.log('[POST /invitations] Notification sent successfully for userId:', userId);

      // Update status to sent (or resent for existing invitations)
      await supabase
        .from('event_invitations')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', existingInvitation.id);

      results.push({ userId, username, success: true, token: existingInvitation.token });
    } catch (error) {
      console.error('[POST /invitations] Failed to send user invite notification:', {
        userId,
        username,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      results.push({
        userId,
        username,
        success: false,
        error: 'Failed to send notification'
      });
    }
  }

  // Increment quota for successful sends
  const successCount = results.filter(r => r.success).length;
  if (successCount > 0) {
    await supabase.rpc('increment_invite_quota', {
      p_user_id: user.id,
      p_count: successCount,
    });
  }

  // ---- Audience blasts (@all / @games) — validated above, admin only ----
  let audienceQueued = 0;
  if (validAudiences.length > 0 && serviceUrl && serviceKey) {
    const admin = createServiceRoleClient(serviceUrl, serviceKey);

    try {
      const excluded = await getBlastExclusions(admin, event.id, user.id);

      // Resolve every audience; first audience to claim a user wins (for the analytics column)
      const memberAudience = new Map<string, string>();
      for (const key of validAudiences) {
        const members = subtractExclusions(
          await resolveAudienceMembers(admin, key),
          excluded
        );
        for (const memberId of members) {
          if (!memberAudience.has(memberId)) memberAudience.set(memberId, key);
        }
      }

      if (memberAudience.size > 0) {
        // Real names on the rows — otherwise the organizer's new_rsvp notification and
        // invitation list show the synthetic user-<uuid>@dalat.app address
        const { data: memberProfiles } = await admin
          .from('profiles')
          .select('id, display_name, username, locale')
          .in('id', [...memberAudience.keys()]);
        const profileById = new Map(
          (memberProfiles ?? []).map((p: { id: string; display_name: string | null; username: string | null; locale: string | null }) => [
            p.id,
            p,
          ])
        );

        const rows = [...memberAudience.entries()].map(([memberId, audienceKey]) => {
          const p = profileById.get(memberId);
          return {
            event_id: event.id,
            invited_by: user.id,
            email: `user-${memberId}@dalat.app`,
            name: p?.display_name || p?.username || null,
            status: 'pending',
            claimed_by: memberId,
            audience: audienceKey,
          };
        });

        // ON CONFLICT DO NOTHING — never re-notify an already-invited user
        const { data: inserted, error: insertError } = await admin
          .from('event_invitations')
          .upsert(rows, { onConflict: 'event_id,email', ignoreDuplicates: true })
          .select('id, claimed_by, token');

        if (insertError) {
          console.error('[invitations] audience batch insert failed:', insertError);
          return NextResponse.json({ error: 'Failed to create audience invitations' }, { status: 500 });
        }

        if (inserted && inserted.length > 0) {
          // Fan out via scheduled_notifications — /api/cron/process-notifications
          // delivers due rows every 5 min through notify() with built-in retries.
          // Stagger scheduled_for to pace Resend (~2 req/s, free tier ~100/day):
          // 30s apart keeps each cron batch to ~10 sends; rows beyond the daily
          // email cap start tomorrow.
          const EMAILS_PER_DAY = Number(process.env.AUDIENCE_BLAST_DAILY_EMAIL_CAP ?? 90);
          const startMs = Date.now();
          const DAY_MS = 24 * 60 * 60 * 1000;
          const note = personalNote?.trim() || null;

          const scheduledRows = inserted.map((inv: { id: string; claimed_by: string; token: string }, i: number) => {
            const dayOffset = Math.floor(i / EMAILS_PER_DAY) * DAY_MS;
            const scheduledFor = new Date(startMs + dayOffset + (i % EMAILS_PER_DAY) * 30_000);
            return {
              user_id: inv.claimed_by,
              type: 'audience_invitation',
              scheduled_for: scheduledFor.toISOString(),
              status: 'pending',
              reference_type: 'audience_blast',
              reference_id: event.id,
              payload: {
                type: 'audience_invitation',
                userId: inv.claimed_by,
                locale: (profileById.get(inv.claimed_by)?.locale as Locale) || 'en',
                eventId: event.id,
                eventSlug: event.slug,
                eventTitle: event.title,
                startsAt: event.starts_at,
                locationName: event.location_name,
                inviterName,
                token: inv.token,
                personalNote: note,
              },
            };
          });

          const { error: scheduleError } = await admin
            .from('scheduled_notifications')
            .insert(scheduledRows);

          if (scheduleError) {
            // Invitations exist but nothing is scheduled — surface loudly so the
            // admin retries the blast (upsert dedupe makes the retry safe... but a
            // retry skips existing rows, so log the ids for manual recovery too).
            console.error(
              '[invitations] audience schedule insert failed:',
              scheduleError.message,
              'invitation ids:',
              inserted.map((r: { id: string }) => r.id).join(',')
            );
            return NextResponse.json({ error: 'Failed to schedule audience notifications' }, { status: 500 });
          }

          // Delivery is delegated to the cron (with retries); mark queued rows sent
          // so the creator's panel doesn't show them as stuck 'pending' forever.
          await admin
            .from('event_invitations')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .in('id', inserted.map((r: { id: string }) => r.id));

          audienceQueued = inserted.length;
        }
      }
    } catch (err) {
      console.error('[invitations] audience resolution failed:', err);
      return NextResponse.json({ error: 'Failed to resolve audience' }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    results,
    sent: successCount,
    failed: results.length - successCount,
    queued: audienceQueued,
  });
}

// GET /api/events/[slug]/invitations - List invitations for event
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const supabase = await createClient();
  const { slug } = await params;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Get the event by slug
  const { data: event } = await supabase
    .from('events')
    .select('id, created_by')
    .eq('slug', slug)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  // Only event creator can view invitations
  if (event.created_by !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Get invitations with counts
  const [{ data: invitations }, { data: counts }] = await Promise.all([
    supabase
      .from('event_invitations')
      .select('id, email, name, status, rsvp_status, claimed_by, sent_at, responded_at, created_at')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false }),
    supabase.rpc('get_invitation_counts', { p_event_id: event.id }),
  ]);

  return NextResponse.json({
    invitations: invitations || [],
    counts: counts || {},
  });
}
