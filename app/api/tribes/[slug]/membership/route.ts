import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteParams { params: Promise<{ slug: string }>; }

export async function POST(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { data, error } = await supabase.rpc('join_community', {
    p_slug: slug,
    p_invite_code: typeof body.invite_code === 'string' ? body.invite_code : null,
    p_message: typeof body.message === 'string' ? body.message : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 });
  if (data.status === 'joined' && typeof body.visit_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.visit_id)) {
    const {data: community}=await supabase.from('tribes').select('id').eq('slug',slug).maybeSingle();
    if(community)await supabase.rpc('complete_community_visit',{p_visit_id:body.visit_id,p_community_id:community.id});
  }
  return NextResponse.json(data);
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

  const { error } = await supabase.from('tribe_members').delete().eq('tribe_id', tribe.id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  return NextResponse.json({ success: true });
}
