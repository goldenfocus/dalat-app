import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.muted !== 'boolean') return NextResponse.json({ error: 'Invalid preference' }, { status: 400 });
  const { slug } = await params;
  const { data: tribe } = await supabase.from('tribes').select('id').eq('slug', slug).maybeSingle();
  if (!tribe) return NextResponse.json({ error: 'Community not found' }, { status: 404 });
  const { data: membership, error: memberError } = await supabase.from('tribe_members').select('id')
    .eq('tribe_id', tribe.id).eq('user_id', user.id).eq('status', 'active').maybeSingle();
  if (memberError || !membership) return NextResponse.json({ error: 'Active membership required' }, { status: 403 });
  const { error } = await supabase.from('community_notification_preferences').upsert({
    tribe_id: tribe.id, user_id: user.id, muted: body.muted,
  }, { onConflict: 'tribe_id,user_id' });
  if (error) return NextResponse.json({ error: 'Could not save preference' }, { status: 500 });
  return NextResponse.json({ muted: body.muted });
}
