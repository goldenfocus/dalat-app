import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyOrganizerNewRsvp } from '@/lib/notifications';
import type { Locale, InvitationRsvpStatus } from '@/lib/types';

interface RsvpRequest {
  response: InvitationRsvpStatus;
}

// POST /api/invite/[token]/rsvp - Submit RSVP response (public)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const supabase = await createClient();
  const { token } = await params;

  const body: RsvpRequest = await request.json();
  const { response } = body;

  if (!response || !['going', 'cancelled', 'interested'].includes(response)) {
    return NextResponse.json({
      error: 'Invalid response. Must be: going, cancelled, or interested'
    }, { status: 400 });
  }

  // Get invitation with event details
  const { data: invitation, error } = await supabase
    .from('event_invitations')
    .select(`
      id,
      email,
      name,
      status,
      rsvp_status,
      claimed_by,
      event_id,
      events (
        id,
        slug,
        title,
        created_by,
        status
      ),
      profiles:invited_by (
        locale
      )
    `)
    .eq('token', token)
    .single();

  if (error || !invitation) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  }

  const event = invitation.events as unknown as {
    id: string;
    slug: string;
    title: string;
    created_by: string;
    status: string;
  };

  if (!event || event.status === 'cancelled') {
    return NextResponse.json({ error: 'Event is no longer available' }, { status: 410 });
  }

  // Update invitation with RSVP
  const { error: updateError } = await supabase
    .from('event_invitations')
    .update({
      status: 'responded',
      rsvp_status: response,
      responded_at: new Date().toISOString(),
    })
    .eq('token', token);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to save response' }, { status: 500 });
  }

  // If the invitation is claimed (user has an account), create/update RSVP record
  if (invitation.claimed_by && response === 'going') {
    await supabase
      .from('rsvps')
      .upsert({
        event_id: event.id,
        user_id: invitation.claimed_by,
        status: 'going',
        plus_ones: 0,
      }, {
        onConflict: 'event_id,user_id',
      });
  } else if (invitation.claimed_by && response === 'interested') {
    await supabase
      .from('rsvps')
      .upsert({
        event_id: event.id,
        user_id: invitation.claimed_by,
        status: 'interested',
        plus_ones: 0,
      }, {
        onConflict: 'event_id,user_id',
      });
  } else if (invitation.claimed_by && response === 'cancelled') {
    // Remove RSVP if declining
    await supabase
      .from('rsvps')
      .delete()
      .eq('event_id', event.id)
      .eq('user_id', invitation.claimed_by);
  }

  // Notify organizer if someone is going
  if (response === 'going') {
    try {
      const inviterProfile = invitation.profiles as unknown as { locale: string | null };
      const locale = (inviterProfile?.locale as Locale) || 'en';
      const guestName = invitation.name || invitation.email.split('@')[0];

      await notifyOrganizerNewRsvp(
        event.created_by,
        locale,
        event.title,
        guestName,
        event.slug
      );
    } catch (notifyError) {
      console.error('Failed to notify organizer:', notifyError);
      // Don't fail the request if notification fails
    }
  }

  return NextResponse.json({
    success: true,
    rsvp_status: response,
    event_slug: event.slug,
  });
}
