import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Get user's tribes
  const { data: memberships, error: membershipsError } = await supabase
    .from('tribe_members')
    .select(`*, tribes(id, slug, name, cover_image_url, access_type, settings)`)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: false });

  if (membershipsError) {
    console.error("My tribes fetch error:", membershipsError);
    return NextResponse.json({ error: 'Failed to fetch tribes' }, { status: 500 });
  }

  // Get pending requests
  const { data: pendingRequests, error: pendingError } = await supabase
    .from('tribe_requests')
    .select(`*, tribes(id, slug, name, cover_image_url, settings)`)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (pendingError) {
    console.error("My tribe requests fetch error:", pendingError);
    return NextResponse.json({ error: 'Failed to fetch pending requests' }, { status: 500 });
  }

  return NextResponse.json({
    tribes: memberships || [],
    pending_requests: pendingRequests || [],
  });
}
