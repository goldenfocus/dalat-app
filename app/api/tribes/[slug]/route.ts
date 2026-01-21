import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteParams { params: Promise<{ slug: string }>; }

export async function GET(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;
  const { data: { user } } = await supabase.auth.getUser();

  const { data: tribe, error } = await supabase
    .from('tribes')
    .select(`*, profiles:created_by(id, display_name, avatar_url, username), tribe_members(count)`)
    .eq('slug', slug)
    .single();

  if (error || !tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 });

  let membership = null;
  if (user) {
    const { data } = await supabase.from('tribe_members').select('role, status, show_on_profile').eq('tribe_id', tribe.id).eq('user_id', user.id).single();
    membership = data;
  }

  if (tribe.access_type === 'secret' && !membership) {
    return NextResponse.json({ error: 'Tribe not found' }, { status: 404 });
  }

  return NextResponse.json({
    tribe: {
      ...tribe,
      is_member: membership?.status === 'active',
      user_role: membership?.role,
      user_status: membership?.status,
      invite_code: membership?.role === 'leader' || membership?.role === 'admin' ? tribe.invite_code : null,
    },
  });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: tribe } = await supabase.from('tribes').select('id, created_by').eq('slug', slug).single();
  if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 });

  const { data: membership } = await supabase.from('tribe_members').select('role').eq('tribe_id', tribe.id).eq('user_id', user.id).single();
  const isAdmin = tribe.created_by === user.id || membership?.role === 'leader' || membership?.role === 'admin';
  if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const body = await request.json();
  const { name, description, access_type, cover_image_url, is_listed } = body;

  const { data: updated, error } = await supabase
    .from('tribes')
    .update({ name: name?.trim(), description: description?.trim(), access_type, cover_image_url, is_listed, updated_at: new Date().toISOString() })
    .eq('id', tribe.id)
    .select()
    .single();

  if (error) {
    console.error("Tribe update error:", error);
    return NextResponse.json({ error: "Failed to update tribe" }, { status: 500 });
  }

  return NextResponse.json({ tribe: updated });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: tribe } = await supabase.from('tribes').select('id, created_by').eq('slug', slug).single();
  if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 });

  // Only creator can delete
  if (tribe.created_by !== user.id) {
    return NextResponse.json({ error: 'Only the creator can delete this tribe' }, { status: 403 });
  }

  const { error } = await supabase.from('tribes').delete().eq('id', tribe.id);
  if (error) {
    console.error("Tribe deletion error:", error);
    return NextResponse.json({ error: "Failed to delete tribe" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
