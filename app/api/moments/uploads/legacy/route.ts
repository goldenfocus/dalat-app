import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { assertCanUpload, UploadApiError } from '@/lib/uploads/server';

export async function POST(request: Request) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = z.object({ eventId: z.string().uuid(), publish: z.boolean().default(false) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  try {
    const { data: visibleEvent, error: visibilityError } = await client.from('events').select('id')
      .eq('id', parsed.data.eventId).maybeSingle();
    if (visibilityError) throw visibilityError;
    if (!visibleEvent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await assertCanUpload(parsed.data.eventId, user.id);
    if (parsed.data.publish) {
      const { data, error } = await client.rpc('publish_user_drafts', { p_event_id: parsed.data.eventId });
      if (error) throw error;
      return NextResponse.json({ count: data });
    }
    const { count, error } = await client.from('moments').select('id', { count: 'exact', head: true })
      .eq('event_id', parsed.data.eventId).eq('user_id', user.id).eq('status', 'draft');
    if (error) throw error;
    return NextResponse.json({ count: count || 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof UploadApiError ? error.message : 'Could not recover saved uploads' },
      { status: error instanceof UploadApiError ? error.status : 503 });
  }
}
