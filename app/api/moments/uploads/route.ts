import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { ownedUpload, prepareDestination, reconcileUpload, uploadAdmin, UploadApiError, type ServerUpload } from '@/lib/uploads/server';
import { mediaError } from '@/lib/uploads/types';

export const maxDuration = 60;
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare'), id: z.string().uuid(), batchId: z.string().uuid(),
    eventId: z.string().uuid(), name: z.string().min(1).max(255), size: z.number().int().positive(),
    mime: z.string(), hash: z.string().regex(/^[a-f0-9]{64}$/),
    capturedAt: z.string().datetime({ offset: true }).nullable().optional(), locale: z.string().max(8).default('en'), restart: z.boolean().optional() }),
  z.object({ action: z.literal('complete'), id: z.string().uuid() }),
]);

export async function POST(request: Request) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in to continue uploading' }, { status: 401 });
  try {
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) throw new UploadApiError('Invalid upload request');
    const body = parsed.data;
    if (body.action === 'complete') {
      return NextResponse.json(await reconcileUpload(await ownedUpload(body.id, user.id)), { headers: { 'Cache-Control': 'no-store' } });
    }
    if (mediaError(body.name, body.size, body.mime)) throw new UploadApiError('Unsupported file or file too large');
    // MIME must be explicit on the server; extension fallback is client-only.
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
      'video/mp4', 'video/webm', 'video/quicktime'].includes(body.mime)) throw new UploadApiError('Unsupported file type');
    // Event visibility uses the caller's RLS, not the service key. Knowing a
    // private event UUID must never grant permission to contribute to it.
    const { data: visibleEvent, error: visibilityError } = await client.from('events').select('id').eq('id', body.eventId).maybeSingle();
    if (visibilityError) throw visibilityError;
    if (!visibleEvent) throw new UploadApiError('Event not found', 404);
    const db = uploadAdmin();
    const { data, error } = await db.rpc('reserve_moment_upload', { p_request: body, p_user_id: user.id });
    if (error) {
      if (/moments_disabled|not_allowed_to_post/.test(error.message)) throw new UploadApiError('You cannot add moments to this event', 403);
      throw error;
    }
    const upload = data.upload as ServerUpload;
    const result = await prepareDestination(upload, body.restart, data.created);
    return NextResponse.json({ ...result, duplicate: upload.id !== body.id && !!result.momentId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (!(error instanceof UploadApiError)) console.error('[uploads] Request failed', error instanceof Error ? error.message : 'Database error');
    return NextResponse.json({ error: error instanceof UploadApiError ? error.message : 'Upload could not finish. Your queue is saved; please retry.' },
      { status: error instanceof UploadApiError ? error.status : 503 });
  }
}
