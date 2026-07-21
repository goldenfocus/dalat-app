import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isReservedTribeSlug, normalizeTribeSlug } from '@/lib/tribes/slug';

interface RouteParams { params: Promise<{ slug: string }>; }

export async function GET(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;
  const { data: { user } } = await supabase.auth.getUser();

  const { data: tribe, error } = await supabase
    .from('tribes')
    // Uses tribes.member_count; the tribe_members(count) aggregate was
    // RLS-filtered and returned 0 for non-members.
    .select(`*, profiles:created_by(id, display_name, avatar_url, username)`)
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

  const { data: tribe, error: tribeError } = await supabase.from('tribes').select('id, created_by, settings').eq('slug', slug).single();
  if (tribeError && tribeError.code !== 'PGRST116') {
    console.error("Tribe fetch error:", tribeError);
    return NextResponse.json({ error: 'Failed to load tribe' }, { status: 500 });
  }
  if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 });

  const { data: membership, error: membershipError } = await supabase.from('tribe_members').select('role').eq('tribe_id', tribe.id).eq('user_id', user.id).single();
  if (membershipError && membershipError.code !== 'PGRST116') {
    console.error("Tribe membership fetch error:", membershipError);
    return NextResponse.json({ error: 'Failed to load membership' }, { status: 500 });
  }
  const isAdmin = tribe.created_by === user.id || membership?.role === 'leader' || membership?.role === 'admin';
  if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const body = await request.json();
  const { name, description, access_type, cover_image_url, is_listed } = body;

  // avatar_url lives inside the settings jsonb — merge, never clobber other keys
  const settingsUpdate = 'avatar_url' in body
    ? { settings: { ...(tribe.settings ?? {}), avatar_url: body.avatar_url || null } }
    : {};

  // Leaders may rename the URL. Unlike creation there's no auto-suffix — they asked
  // for this exact slug, so a clash is an error they need to see, not a silent rename.
  let slugUpdate = {};
  if (typeof body.slug === 'string') {
    const nextSlug = normalizeTribeSlug(body.slug);
    if (nextSlug !== slug) {
      if (nextSlug.length < 2) return NextResponse.json({ error: 'Invalid slug', code: 'slug_invalid' }, { status: 400 });
      if (isReservedTribeSlug(nextSlug)) return NextResponse.json({ error: 'Slug reserved', code: 'slug_reserved' }, { status: 400 });

      const { data: clash } = await supabase.from('tribes').select('id').eq('slug', nextSlug).maybeSingle();
      if (clash) return NextResponse.json({ error: 'Slug already taken', code: 'slug_taken' }, { status: 400 });

      slugUpdate = { slug: nextSlug };
    }
  }

  const { data: updated, error } = await supabase
    .from('tribes')
    .update({ name: name?.trim(), description: description?.trim(), access_type, cover_image_url, is_listed, ...settingsUpdate, ...slugUpdate, updated_at: new Date().toISOString() })
    .eq('id', tribe.id)
    .select()
    .single();

  if (error) {
    // Someone claimed the slug between our check and this write — the UNIQUE index caught it.
    // Gate on intent: tribes.invite_code is UNIQUE too, and the tribes_set_invite_code
    // trigger can raise 23505 on a field the leader never touched.
    if (error.code === '23505' && 'slug' in slugUpdate) {
      return NextResponse.json({ error: 'Slug already taken', code: 'slug_taken' }, { status: 400 });
    }
    // Zero rows updated: the route lets leaders/admins through, but the tribes_update_creator
    // RLS policy only permits the creator. Retrying will never help, so don't suggest it.
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Only the creator can edit this tribe', code: 'not_creator' }, { status: 403 });
    }
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
