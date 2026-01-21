import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyTribeRequestApproved, notifyTribeRequestRejected } from '@/lib/notifications';

interface RouteParams { params: Promise<{ slug: string }>; }

export async function GET(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: tribe } = await supabase.from('tribes').select('id, created_by').eq('slug', slug).single();
  if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 });

  const { data: membership } = await supabase.from('tribe_members').select('role').eq('tribe_id', tribe.id).eq('user_id', user.id).single();
  const isAdmin = tribe.created_by === user.id || membership?.role === 'leader' || membership?.role === 'admin';
  if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const { data: requests, error } = await supabase
    .from('tribe_requests')
    .select(`*, profiles:user_id(id, display_name, avatar_url, username)`)
    .eq('tribe_id', tribe.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    console.error("Requests fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
  }

  return NextResponse.json({ requests });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const { request_id, action } = body;

  if (!request_id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { data: tribe } = await supabase.from('tribes').select('id, name, slug, created_by').eq('slug', slug).single();
  if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 });

  const { data: membership } = await supabase.from('tribe_members').select('role').eq('tribe_id', tribe.id).eq('user_id', user.id).single();
  const isAdmin = tribe.created_by === user.id || membership?.role === 'leader' || membership?.role === 'admin';
  if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const { data: joinRequest } = await supabase.from('tribe_requests').select('*').eq('id', request_id).eq('tribe_id', tribe.id).eq('status', 'pending').single();
  if (!joinRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  if (action === 'approve') {
    await supabase.from('tribe_members').insert({ tribe_id: tribe.id, user_id: joinRequest.user_id, invited_by: user.id });
    await notifyTribeRequestApproved(joinRequest.user_id, tribe.name, tribe.slug);
  } else {
    await notifyTribeRequestRejected(joinRequest.user_id, tribe.name);
  }

  await supabase.from('tribe_requests').update({ status: action === 'approve' ? 'approved' : 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', request_id);

  return NextResponse.json({ success: true });
}
