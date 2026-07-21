import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { findAvailableTribeSlug, isReservedTribeSlug, nextTribeSlugCandidate, normalizeTribeSlug } from '@/lib/tribes/slug';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  const includeAll = searchParams.get('all') === 'true';

  const { data: { user } } = await supabase.auth.getUser();

  let query = supabase
    .from('tribes')
    // Dropped the tribe_members(count) aggregate: RLS filtered it before
    // aggregating, so it reported 0 to non-members. Callers should read
    // tribes.member_count (trigger-maintained) instead.
    .select(`*, profiles:created_by(id, display_name, avatar_url, username)`)
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

  // The availability check above reads through RLS, which hides secret tribes from
  // non-members — so it can hand back a slug the UNIQUE index will still reject.
  // Treat the index as the authority and walk to the next candidate.
  let tribe;
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await supabase
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

    if (!error) { tribe = data; break; }

    if (error.code !== '23505' || attempt >= 4) {
      console.error("Tribe create error:", error);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
    // They asked for this exact slug — say it's taken instead of quietly renaming
    if (slug) return NextResponse.json({ error: 'Slug already taken', code: 'slug_taken' }, { status: 400 });

    finalSlug = nextTribeSlugCandidate(finalSlug);
  }

  await supabase.from('tribe_members').insert({ tribe_id: tribe.id, user_id: user.id, role: 'leader' });

  return NextResponse.json({ tribe });
}
