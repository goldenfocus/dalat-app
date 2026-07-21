import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';

/**
 * POST /api/tribes/invitations/[token] — accept a tribe invitation.
 *
 * Writes go through the service-role client on purpose: `tribe_members_insert`
 * only lets someone self-join a `public` tribe, so under RLS an invitee
 * physically cannot join the `invite_only`/`request` tribe they were invited
 * to. The invitation row IS the authorization, and it is verified here before
 * RLS is bypassed.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const supabase = await createClient();
  const { token } = await params;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  const admin = createServiceRoleClient(serviceUrl, serviceKey);

  const { data: invitation } = await admin
    .from('tribe_invitations')
    .select('id, tribe_id, invited_by, claimed_by, status')
    .eq('token', token)
    .maybeSingle();

  if (!invitation) {
    return NextResponse.json({ error: 'Invalid invitation' }, { status: 404 });
  }

  // A username invite is pre-linked to one account. Only that account may
  // accept it — otherwise a forwarded link becomes a transferable membership.
  // Email invites have claimed_by NULL until someone accepts, so whoever holds
  // the emailed token may accept once; the same trust model as event invites.
  if (invitation.claimed_by && invitation.claimed_by !== user.id) {
    return NextResponse.json({ error: 'This invitation belongs to someone else' }, { status: 403 });
  }

  const { data: tribe } = await admin
    .from('tribes')
    .select('id, slug, name')
    .eq('id', invitation.tribe_id)
    .single();

  if (!tribe) {
    return NextResponse.json({ error: 'Tribe not found' }, { status: 404 });
  }

  const { data: existingMembership } = await admin
    .from('tribe_members')
    .select('id, status')
    .eq('tribe_id', tribe.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingMembership?.status === 'banned') {
    return NextResponse.json({ error: 'You are banned from this tribe' }, { status: 403 });
  }

  if (existingMembership) {
    // Already a member — treat as success so a double-tap lands on the tribe
    // rather than an error page.
    return NextResponse.json({ success: true, slug: tribe.slug, alreadyMember: true });
  }

  // invited_by has existed on tribe_members since 20260130_001 and no code path
  // has ever written it. This is the one that does.
  const { error: joinError } = await admin
    .from('tribe_members')
    .insert({
      tribe_id: tribe.id,
      user_id: user.id,
      invited_by: invitation.invited_by,
    });

  if (joinError) {
    console.error('[POST /tribes/invitations/token] join failed:', joinError);
    return NextResponse.json({ error: 'Failed to join tribe' }, { status: 500 });
  }

  const { error: updateError } = await admin
    .from('tribe_invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      claimed_by: user.id,
    })
    .eq('id', invitation.id);

  if (updateError) {
    // The membership landed, which is what the user asked for — log loudly
    // rather than failing a join that actually happened.
    console.error('[POST /tribes/invitations/token] status update failed:', updateError);
  }

  return NextResponse.json({ success: true, slug: tribe.slug });
}
