import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { locales } from '@/lib/i18n/locales';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const caption = z.object({ text: z.string().max(500), locale: z.enum(locales) });
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { data, error } = await client.from('moments').select('id,text_content')
    .eq('id', id).eq('user_id', user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not load caption' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = caption.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid caption' }, { status: 400 });
  const { id } = await params;
  // Authorize with the session before using the service key. The old UPDATE
  // policy only permits pending moments, so a published caption needs this
  // narrowly scoped write, not a blanket RLS expansion.
  const { data: owned, error: readError } = await client.from('moments').select('id')
    .eq('id', id).eq('user_id', user.id).maybeSingle();
  if (readError) return NextResponse.json({ error: 'Could not verify caption ownership' }, { status: 503 });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await service.from('moments').update({
    text_content: parsed.data.text.trim() || null, source_locale: parsed.data.locale,
  }).eq('id', id).eq('user_id', user.id).select('id,text_content').maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not save caption' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
