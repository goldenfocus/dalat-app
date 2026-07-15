import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { getAudienceCounts } from '@/lib/audiences/resolve';

// GET /api/audiences — pinned audience options for the invite modal (admin only)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin' && profile?.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  try {
    const audiences = await getAudienceCounts(createServiceRoleClient(url, serviceKey));
    return NextResponse.json({ audiences });
  } catch (err) {
    console.error('[audiences] count failed:', err);
    return NextResponse.json({ error: 'Failed to load audiences' }, { status: 500 });
  }
}
