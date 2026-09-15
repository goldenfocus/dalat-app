import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const supabase = await createClient();
  const { token } = await params;
  if (!z.string().uuid().safeParse(token).success) return NextResponse.json({ error: 'Invalid invitation' }, { status: 400 });
  const { data, error } = await supabase.rpc('accept_community_invitation', { p_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 });
  return NextResponse.json(data);
}
