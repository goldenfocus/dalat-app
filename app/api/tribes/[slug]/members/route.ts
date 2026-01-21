import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeSingle, singleOrNull } from '@/lib/supabase/helpers';

interface RouteParams { params: Promise<{ slug: string }>; }

export async function GET(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const includeBanned = searchParams.get('banned') === 'true';

  const tribeResult = await safeSingle(
    supabase.from('tribes').select('id').eq('slug', slug).single()
  );
  if (!tribeResult.success) {
    return NextResponse.json({ error: tribeResult.error }, { status: tribeResult.status });
  }
  const tribe = tribeResult.data;

  let query = supabase
    .from('tribe_members')
    .select(`*, profiles:user_id(id, display_name, avatar_url, username)`)
    .eq('tribe_id', tribe.id)
    .order('joined_at', { ascending: true });

  if (!includeBanned) {
    query = query.eq('status', 'active');
  }

  const { data: members, error } = await query;

  if (error) {
    console.error("Members fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }

  return NextResponse.json({ members });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const { user_id, role, status } = body;

  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

  const tribeResult = await safeSingle(
    supabase.from('tribes').select('id, created_by').eq('slug', slug).single()
  );
  if (!tribeResult.success) {
    return NextResponse.json({ error: tribeResult.error }, { status: tribeResult.status });
  }
  const tribe = tribeResult.data;

  // Membership check - null is valid (user might not be a member)
  const membership = await singleOrNull(
    supabase.from('tribe_members').select('role').eq('tribe_id', tribe.id).eq('user_id', user.id).single()
  );
  const isAdmin = tribe.created_by === user.id || membership?.role === 'leader' || membership?.role === 'admin';
  if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  if (user_id === tribe.created_by) return NextResponse.json({ error: 'Cannot modify creator' }, { status: 400 });

  // Only leaders can promote to leader or demote from leader
  if (role === 'leader' || role === 'admin') {
    const targetMember = await singleOrNull(
      supabase.from('tribe_members').select('role').eq('tribe_id', tribe.id).eq('user_id', user_id).single()
    );
    if (targetMember?.role === 'leader' && membership?.role !== 'leader' && tribe.created_by !== user.id) {
      return NextResponse.json({ error: 'Only leaders can modify other leaders' }, { status: 403 });
    }
  }

  const updates: Record<string, unknown> = {};
  if (role) updates.role = role;
  if (status) updates.status = status;

  await supabase.from('tribe_members').update(updates).eq('tribe_id', tribe.id).eq('user_id', user_id);

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const user_id = searchParams.get('user_id');

  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

  const tribeResult = await safeSingle(
    supabase.from('tribes').select('id, created_by').eq('slug', slug).single()
  );
  if (!tribeResult.success) {
    return NextResponse.json({ error: tribeResult.error }, { status: tribeResult.status });
  }
  const tribe = tribeResult.data;

  const membership = await singleOrNull(
    supabase.from('tribe_members').select('role').eq('tribe_id', tribe.id).eq('user_id', user.id).single()
  );
  const isAdmin = tribe.created_by === user.id || membership?.role === 'leader' || membership?.role === 'admin';
  if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  if (user_id === tribe.created_by) return NextResponse.json({ error: 'Cannot remove creator' }, { status: 400 });

  await supabase.from('tribe_members').delete().eq('tribe_id', tribe.id).eq('user_id', user_id);

  return NextResponse.json({ success: true });
}
