import { randomBytes, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient as serviceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { locales } from '@/lib/i18n/locales';
import { z } from 'zod';
const schema = z.object({
  kind: z.enum(['community', 'event', 'profile']), slug: z.string().min(1).max(180),
  visitId: z.uuid().optional(),
  inviteCode: z.string().max(64).optional(), joinCommunity: z.boolean().optional(),
  locale: z.enum(locales).default('en'),
});
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const body = parsed.data;
  const supabase = await createClient();
  let communityId: string | null = null;
  let inviterId: string | null = null;
  let targetId: string;
  let label: string;
  let next: string;
  if (body.kind === 'community') {
    const { data: rawCommunity } = body.inviteCode
      ? await supabase.rpc('get_tribe_by_code', { p_code: body.inviteCode }).maybeSingle()
      : await supabase.from('tribes').select('id,slug,name').eq('slug', body.slug).maybeSingle();
    const data = rawCommunity as { id: string; slug: string; name: string } | null;
    if (!data || data.slug !== body.slug) return NextResponse.json({ error: 'Community not available' }, { status: 404 });
    communityId = targetId = data.id; label = data.name; next = `/communities/${data.slug}`;
  } else if (body.kind === 'event') {
    const { data } = await supabase.from('events').select('id,slug,title,tribe_id,status').eq('slug', body.slug).eq('status','published').maybeSingle();
    if (!data) return NextResponse.json({ error: 'Event not available' }, { status: 404 });
    targetId = data.id; communityId = data.tribe_id; label = data.title; next = `/events/${data.slug}`;
  } else {
    const { data } = await supabase.from('profiles').select('id,username,display_name').eq('username', body.slug).eq('is_ghost',false).maybeSingle();
    if (!data) return NextResponse.json({ error: 'Profile not available' }, { status: 404 });
    inviterId = targetId = data.id; label = data.display_name || data.username; next = `/${data.username}`;
  }
  const secret = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(secret).digest('hex');
  const admin = serviceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  await admin.from('signup_intents').delete().lt('expires_at',new Date().toISOString());
  const { data: visit } = body.visitId && communityId ? await admin.from("community_visits").select("id").eq("id",body.visitId).eq("community_id",communityId).maybeSingle() : { data: null };
  const { data, error } = await admin.from('signup_intents').insert({
    visit_id: visit?.id || null,
    kind: body.kind, target_id: targetId, community_id: communityId, inviter_id: inviterId,
    join_community: body.kind === 'community' || !!body.joinCommunity,
    invite_code: body.inviteCode || null, token_hash: tokenHash, next_path: next, label, locale: body.locale,
  }).select('id').single();
  if (error) return NextResponse.json({ error: 'Could not continue. Please try again.' }, { status: 500 });
  const response = NextResponse.json({ url: `/auth/continue?intent=${data.id}` });
  response.cookies.set(`dalat-intent-${data.id}`, secret, { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 7 * 86400 });
  return response;
}
