import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyUserInvitation, sendEmailInvitation } from '@/lib/notifications';
import type { Locale, InviteQuotaCheck } from '@/lib/types';

interface InviteRequest {
  emails?: Array<{ email: string; name?: string }>;
  users?: Array<{ userId: string; username: string }>;
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
  const { emails = [], users = [] } = body;

  const totalInvites = emails.length + users.length;
  if (totalInvites === 0) {
    return NextResponse.json({ error: 'emails or users array required' }, { status: 400 });
  }

  // Check quota before sending
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

  // Get inviter profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, username, locale')
    .eq('id', user.id)
    .single();

  const inviterName = profile?.display_name || profile?.username || 'Someone';
  const inviterLocale = (profile?.locale as Locale) || 'en';

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

  return NextResponse.json({
    success: true,
    results,
    sent: successCount,
    failed: results.length - successCount,
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
