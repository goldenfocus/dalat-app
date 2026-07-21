import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyTribeInvitation, sendEmailInvitation } from '@/lib/notifications';
import type { Locale, InviteQuotaCheck } from '@/lib/types';

// Email sends are paced 1s apart for Resend's rate limit, so a leader inviting
// their whole tribe needs more than the default function window.
export const maxDuration = 300;

interface TribeInviteRequest {
  /** Plain email addresses. */
  emails?: string[];
  /** profiles.id values — invited in-app, never by email. */
  users?: string[];
  personalNote?: string;
}

interface InviteResult {
  email?: string;
  userId?: string;
  success: boolean;
  error?: string;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// POST /api/tribes/[slug]/invitations — invite people to a tribe
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

  const { data: tribe } = await supabase
    .from('tribes')
    .select('id, name, slug')
    .eq('slug', slug)
    .single();

  if (!tribe) {
    return NextResponse.json({ error: 'Tribe not found' }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, username, locale, role')
    .eq('id', user.id)
    .single();

  // Two-sided check: RLS authorizes the actor on INSERT, but an unauthorized
  // caller would otherwise get a confusing empty-result 500 instead of a 403.
  const isSiteAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';
  let isTribeAdmin = isSiteAdmin;
  if (!isTribeAdmin) {
    const { data: membership } = await supabase
      .from('tribe_members')
      .select('role, status')
      .eq('tribe_id', tribe.id)
      .eq('user_id', user.id)
      .single();
    isTribeAdmin =
      membership?.status === 'active' &&
      (membership.role === 'leader' || membership.role === 'admin');
  }

  if (!isTribeAdmin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const body: TribeInviteRequest = await request.json();
  const emails = (body.emails ?? []).map((e) => e.toLowerCase().trim()).filter(Boolean);
  const users = (body.users ?? []).filter(Boolean);
  const personalNote = body.personalNote?.trim() || null;

  const total = emails.length + users.length;
  if (total === 0) {
    return NextResponse.json({ error: 'emails or users array required' }, { status: 400 });
  }

  // Tribe invites have their OWN bucket (30/day, 100/week). Sharing the event
  // bucket would 429 a leader on their sixth invite and burn their event
  // allowance doing it.
  const { data: quotaCheck } = await supabase.rpc('check_tribe_invite_quota', {
    p_user_id: user.id,
    p_count: total,
  }) as { data: InviteQuotaCheck | null };

  if (!quotaCheck?.allowed) {
    return NextResponse.json({
      error: 'Quota exceeded',
      reason: quotaCheck?.reason,
      remaining_daily: quotaCheck?.remaining_daily ?? 0,
      remaining_weekly: quotaCheck?.remaining_weekly ?? 0,
    }, { status: 429 });
  }

  const inviterName = profile?.display_name || profile?.username || 'Someone';
  const inviterLocale = (profile?.locale as Locale) || 'en';

  const results: InviteResult[] = [];

  // ---- Email path ----
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    if (i > 0) await delay(1000);

    const { data: invitation, error: insertError } = await supabase
      .from('tribe_invitations')
      .insert({
        tribe_id: tribe.id,
        invited_by: user.id,
        email,
        personal_note: personalNote,
        status: 'pending',
      })
      .select('id, token')
      .single();

    let row = invitation;

    if (insertError) {
      if (insertError.code === '23505') {
        // Already invited — re-fetch and resend rather than failing the person
        // who just typed the address.
        const { data: existing } = await supabase
          .from('tribe_invitations')
          .select('id, token')
          .eq('tribe_id', tribe.id)
          .eq('email', email)
          .single();
        if (!existing) {
          results.push({ email, success: false, error: 'Already invited' });
          continue;
        }
        row = existing;
      } else {
        console.error('[POST /tribes/invitations] insert failed:', insertError);
        results.push({ email, success: false, error: 'Failed to create invitation' });
        continue;
      }
    }

    if (!row) {
      results.push({ email, success: false, error: 'Failed to create invitation' });
      continue;
    }

    try {
      await sendEmailInvitation(email, {
        type: 'tribe_invitation',
        userId: `tribe-invite-${row.token}`,
        locale: inviterLocale,
        tribeName: tribe.name,
        tribeSlug: tribe.slug,
        inviterName,
        token: row.token,
        inviteeEmail: email,
        personalNote,
      });

      await supabase
        .from('tribe_invitations')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', row.id);

      results.push({ email, success: true });
    } catch (error) {
      console.error('[POST /tribes/invitations] email send failed:', error);
      results.push({ email, success: false, error: 'Failed to send email' });
    }
  }

  // ---- Username path: in-app + push in the RECIPIENT's locale, no email ----
  for (const userId of users) {
    const { data: invitee } = await supabase
      .from('profiles')
      .select('id, locale, display_name, username')
      .eq('id', userId)
      .single();

    if (!invitee) {
      results.push({ userId, success: false, error: 'User not found' });
      continue;
    }

    // Inviting someone who is already in the tribe would create a dead
    // invitation and a notification that leads to "you're already a member".
    const { data: alreadyMember } = await supabase
      .from('tribe_members')
      .select('id')
      .eq('tribe_id', tribe.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (alreadyMember) {
      results.push({ userId, success: false, error: 'Already a member' });
      continue;
    }

    // Synthetic address so one table and one unique constraint serve both paths.
    const syntheticEmail = `user-${userId}@dalat.app`;

    const { data: invitation, error: insertError } = await supabase
      .from('tribe_invitations')
      .insert({
        tribe_id: tribe.id,
        invited_by: user.id,
        email: syntheticEmail,
        name: invitee.display_name || invitee.username,
        personal_note: personalNote,
        status: 'pending',
        claimed_by: userId, // Pre-linked: only this account may accept the token
      })
      .select('id, token')
      .single();

    let row = invitation;

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: existing } = await supabase
          .from('tribe_invitations')
          .select('id, token')
          .eq('tribe_id', tribe.id)
          .eq('email', syntheticEmail)
          .single();
        if (!existing) {
          results.push({ userId, success: false, error: 'Already invited' });
          continue;
        }
        row = existing;
      } else {
        console.error('[POST /tribes/invitations] user insert failed:', insertError);
        results.push({ userId, success: false, error: 'Failed to create invitation' });
        continue;
      }
    }

    if (!row) {
      results.push({ userId, success: false, error: 'Failed to create invitation' });
      continue;
    }

    try {
      await notifyTribeInvitation(
        userId,
        (invitee.locale as Locale) || 'en',
        tribe.name,
        tribe.slug,
        inviterName,
        row.token,
        personalNote
      );

      await supabase
        .from('tribe_invitations')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', row.id);

      results.push({ userId, success: true });
    } catch (error) {
      console.error('[POST /tribes/invitations] notification failed:', error);
      results.push({ userId, success: false, error: 'Failed to send notification' });
    }
  }

  // Successes only — a bounced email should not cost a leader their quota.
  const successCount = results.filter((r) => r.success).length;
  if (successCount > 0) {
    await supabase.rpc('increment_tribe_invite_quota', {
      p_user_id: user.id,
      p_count: successCount,
    });
  }

  return NextResponse.json({
    success: true,
    results,
    sent: successCount,
    failed: results.length - successCount,
    remaining_daily: Math.max(0, (quotaCheck.remaining_daily ?? 0) + (total - successCount)),
  });
}

// GET /api/tribes/[slug]/invitations — list invitations (leaders/admins only)
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

  const { data: tribe } = await supabase
    .from('tribes')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tribe) {
    return NextResponse.json({ error: 'Tribe not found' }, { status: 404 });
  }

  // No explicit role check needed: `tribe_invitations_select` already limits
  // rows to the tribe's admins, the inviter, and the invitee. Deliberately
  // does NOT select `token` — a token is a join grant, and a leaked list of
  // them would be a bulk membership grant.
  const { data: invitations, error } = await supabase
    .from('tribe_invitations')
    .select('id, email, name, status, claimed_by, sent_at, accepted_at, created_at')
    .eq('tribe_id', tribe.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: quota } = await supabase.rpc('check_tribe_invite_quota', {
    p_user_id: user.id,
    p_count: 0,
  }) as { data: InviteQuotaCheck | null };

  return NextResponse.json({ invitations: invitations ?? [], quota });
}
