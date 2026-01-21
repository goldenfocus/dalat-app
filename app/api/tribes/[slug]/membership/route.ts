import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyTribeJoinRequest } from '@/lib/notifications';

interface RouteParams { params: Promise<{ slug: string }>; }

export async function POST(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const { invite_code, message } = body;

  let tribe;
  if (invite_code) {
    const { data } = await supabase.rpc('get_tribe_by_code', { p_code: invite_code });
    tribe = data?.[0];
    if (!tribe) return NextResponse.json({ error: 'Invalid or expired invite code' }, { status: 400 });
  } else {
    const { data } = await supabase.from('tribes').select('*').eq('slug', slug).single();
    tribe = data;
  }

  if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 });

  // Check if user is banned
  const { data: isBanned } = await supabase.rpc('is_tribe_banned', { p_tribe_id: tribe.id, p_user_id: user.id });
  if (isBanned) return NextResponse.json({ error: 'You are banned from this tribe' }, { status: 403 });

  const { data: existing } = await supabase.from('tribe_members').select('id, status').eq('tribe_id', tribe.id).eq('user_id', user.id).single();
  if (existing) {
    if (existing.status === 'banned') return NextResponse.json({ error: 'You are banned from this tribe' }, { status: 403 });
    return NextResponse.json({ error: 'Already a member' }, { status: 400 });
  }

  switch (tribe.access_type) {
    case 'public':
      await supabase.from('tribe_members').insert({ tribe_id: tribe.id, user_id: user.id });
      return NextResponse.json({ success: true, status: 'joined' });

    case 'request':
      const { error: reqError } = await supabase.from('tribe_requests').insert({ tribe_id: tribe.id, user_id: user.id, message: message?.trim() || null });
      if (reqError?.code === '23505') return NextResponse.json({ error: 'Request already pending' }, { status: 400 });
      if (reqError) return NextResponse.json({ error: reqError.message }, { status: 500 });

      // Notify admins
      const { data: admins } = await supabase.from('tribe_members').select('user_id').eq('tribe_id', tribe.id).in('role', ['leader', 'admin']);
      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single();
      if (admins?.length) {
        await notifyTribeJoinRequest(admins.map(a => a.user_id), profile?.display_name || 'Someone', tribe.name, tribe.slug);
      }

      return NextResponse.json({ success: true, status: 'requested' });

    case 'invite_only':
    case 'secret':
      if (!invite_code) return NextResponse.json({ error: 'Invite code required' }, { status: 400 });
      await supabase.from('tribe_members').insert({ tribe_id: tribe.id, user_id: user.id });
      return NextResponse.json({ success: true, status: 'joined' });

    default:
      return NextResponse.json({ error: 'Invalid access type' }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: tribe } = await supabase.from('tribes').select('id, created_by').eq('slug', slug).single();
  if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 });

  // Check if user is the only leader
  const { data: membership } = await supabase.from('tribe_members').select('role').eq('tribe_id', tribe.id).eq('user_id', user.id).single();

  if (membership?.role === 'leader') {
    const { data: otherLeaders } = await supabase
      .from('tribe_members')
      .select('id')
      .eq('tribe_id', tribe.id)
      .eq('role', 'leader')
      .neq('user_id', user.id);

    if (!otherLeaders?.length) {
      return NextResponse.json({ error: 'You must transfer leadership before leaving' }, { status: 400 });
    }
  }

  await supabase.from('tribe_members').delete().eq('tribe_id', tribe.id).eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
