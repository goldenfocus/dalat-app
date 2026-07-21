import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { findAvailableTribeSlug, isReservedTribeSlug, normalizeTribeSlug } from '@/lib/tribes/slug';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  const includeAll = searchParams.get('all') === 'true';

  const { data: { user } } = await supabase.auth.getUser();

  let query = supabase
    .from('tribes')
    .select(`*, profiles:created_by(id, display_name, avatar_url, username), tribe_members(count)`)
    .order('created_at', { ascending: false });

  // Admin users can see all tribes for moderation
  if (!includeAll || !user) {
    query = query.in('access_type', ['public', 'request']).eq('is_listed', true);
  }

  if (search) query = query.ilike('name', `%${search}%`);

  const { data: tribes, error } = await query;
  if (error) {
    console.error("Tribes fetch error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ tribes });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const { name, description, access_type, slug } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  let finalSlug: string;
  if (slug) {
    // Explicit slug from the caller must be exactly what they asked for, or an error
    finalSlug = normalizeTribeSlug(slug);
    if (finalSlug.length < 2) return NextResponse.json({ error: 'Invalid slug', code: 'slug_invalid' }, { status: 400 });
    if (isReservedTribeSlug(finalSlug)) return NextResponse.json({ error: 'Slug reserved', code: 'slug_reserved' }, { status: 400 });

    const { data: existing } = await supabase.from('tribes').select('id').eq('slug', finalSlug).maybeSingle();
    if (existing) return NextResponse.json({ error: 'Slug already taken', code: 'slug_taken' }, { status: 400 });
  } else {
    finalSlug = await findAvailableTribeSlug(supabase, name);
  }

  const { data: tribe, error } = await supabase
    .from('tribes')
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      slug: finalSlug,
      access_type: access_type || 'public',
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Tribe create error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  await supabase.from('tribe_members').insert({ tribe_id: tribe.id, user_id: user.id, role: 'leader' });

  return NextResponse.json({ tribe });
}
