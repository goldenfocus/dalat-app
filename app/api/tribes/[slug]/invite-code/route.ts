import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteParams { params: Promise<{ slug: string }>; }

export async function POST(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: tribe } = await supabase.from('tribes').select('id, created_by').eq('slug', slug).single();
  if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 });

  const { data: membership } = await supabase.from('tribe_members').select('role, status').eq('tribe_id', tribe.id).eq('user_id', user.id).single();
  const isAdmin = tribe.created_by === user.id || (membership?.status === 'active' && (membership.role === 'leader' || membership.role === 'admin'));
  if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const { data: newCode, error } = await supabase.rpc('regenerate_tribe_invite_code', { p_tribe_id: tribe.id });

  if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 500 });
  return NextResponse.json({ invite_code: newCode });
}
