import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient();
  const body = z.object({ user_id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid member' }, { status: 400 });
  const { slug } = await params;
  const { error } = await supabase.rpc('transfer_community_ownership', { p_slug: slug, p_user_id: body.data.user_id });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 });
  return NextResponse.json({ success: true });
}
