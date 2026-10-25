import 'server-only';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getR2ConfigOrThrow } from '@/lib/storage/r2-config';
import { R2StorageProvider } from '@/lib/storage/r2';
import { createTusDirectUpload, deleteVideo, getVideoDetails } from '@/lib/cloudflare-stream';
import type { UploadReceipt } from './types';

export function uploadAdmin() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export interface ServerUpload {
  id: string; batch_id: string; user_id: string; event_id: string; file_hash: string;
  filename: string; file_size: number; mime_type: string; source_locale: string;
  object_path: string | null; media_url: string | null; cf_video_uid: string | null;
  upload_url: string | null; moment_id: string | null; received_at: string | null;
}
export class UploadApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function ownedUpload(id: string, userId: string): Promise<ServerUpload> {
  const { data, error } = await uploadAdmin().from('moment_uploads').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new UploadApiError('Upload not found', 404);
  return data as ServerUpload;
}

// Used before reserving storage, and again transactionally at publication.
export async function assertCanUpload(eventId: string, userId: string) {
  const db = uploadAdmin();
  const { data: event, error } = await db.from('events').select('id,created_by').eq('id', eventId).maybeSingle();
  if (error) throw error;
  if (!event) throw new UploadApiError('Event not found', 404);
  const { data: settings, error: settingsError } = await db.from('event_settings')
    .select('moments_enabled,moments_who_can_post').eq('event_id', eventId).maybeSingle();
  if (settingsError) throw settingsError;
  if (settings?.moments_enabled === false) throw new UploadApiError('Moments are disabled for this event', 403);
  const who = settings?.moments_who_can_post ?? 'anyone';
  if (event.created_by === userId || who === 'anyone') return;
  const { data: rsvp, error: rsvpError } = await db.from('rsvps').select('status').eq('event_id', eventId).eq('user_id', userId).maybeSingle();
  if (rsvpError) throw rsvpError;
  if ((who === 'confirmed' && rsvp?.status === 'going') ||
      (who === 'rsvp' && ['going', 'interested', 'waitlist'].includes(rsvp?.status))) return;
  throw new UploadApiError('You cannot add moments to this event', 403);
}

function storage() {
  const config = getR2ConfigOrThrow();
  return { config, client: new S3Client({ region: 'auto', endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }) };
}
async function head(key: string) {
  const { config, client } = storage();
  try { return await client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: key })); }
  catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

async function receivedPhoto(upload: ServerUpload): Promise<string | null> {
  if (!upload.object_path) return null;
  const { config, client } = storage();
  const key = `moments/${upload.object_path}`;
  const heic = /\.(heic|heif)$/i.test(key);
  const displayKey = heic ? key.replace(/\.(heic|heif)$/i, '.jpg') : key;
  // Conversion is restart-safe: a completed JPEG wins over an interrupted response.
  if (heic && await head(displayKey)) return `${config.publicUrl}/${displayKey}`;
  const object = await head(key);
  if (!object) return null;
  if (object.ContentLength !== upload.file_size) throw new UploadApiError('The uploaded file is incomplete', 409);
  if (heic) {
    const original = await client.send(new GetObjectCommand({ Bucket: config.bucketName, Key: key }));
    if (!original.Body) return null;
    const convert = (await import('heic-convert')).default;
    const bytes = Buffer.from(await original.Body.transformToByteArray());
    const jpeg = Buffer.from(await convert({ buffer: bytes, format: 'JPEG', quality: 0.9 }));
    await client.send(new PutObjectCommand({ Bucket: config.bucketName, Key: displayKey,
      Body: jpeg, ContentType: 'image/jpeg', CacheControl: 'public,max-age=31536000,immutable' }));
  }
  return `${config.publicUrl}/${displayKey}`;
}

export async function receipt(upload: ServerUpload): Promise<UploadReceipt> {
  if (!upload.moment_id) return { id: upload.id, status: 'waiting' };
  const { data: moment, error } = await uploadAdmin().from('moments').select('status,video_status,media_url,thumbnail_url')
    .eq('id', upload.moment_id).maybeSingle();
  if (error) throw error;
  if (!moment) throw new UploadApiError('This moment was removed', 410);
  const status = moment.status === 'pending' ? 'pending' :
    moment.video_status === 'error' ? 'error' :
    upload.cf_video_uid && moment.video_status !== 'ready' ? 'processing' : 'published';
  return { id: upload.id, momentId: upload.moment_id, status, previewUrl: moment.thumbnail_url || moment.media_url || undefined };
}

// Runs on client completion, recovery, the Stream webhook, and the existing cron.
// It never trusts a client-provided public URL or a claim that bytes arrived.
export async function reconcileUpload(upload: ServerUpload): Promise<UploadReceipt> {
  const db = uploadAdmin();
  let details: Awaited<ReturnType<typeof getVideoDetails>> | undefined;
  if (upload.cf_video_uid) {
    details = await getVideoDetails(upload.cf_video_uid);
    if (details.status.state === 'error') {
      if (upload.moment_id) await db.from('moments').update({ video_status: 'error' }).eq('id', upload.moment_id);
      return { id: upload.id, status: 'error', error: 'Video processing failed' };
    }
  }
  let mediaUrl: string | null = null;
  if (!upload.received_at) {
    if (details) {
      if (!['queued', 'inprogress', 'ready'].includes(details.status.state) && !details.readyToStream)
        return { id: upload.id, status: 'waiting' };
    } else {
      mediaUrl = await receivedPhoto(upload);
      if (!mediaUrl) return { id: upload.id, status: 'waiting' };
    }
  }
  if (!upload.moment_id || details) {
    const playable = !!((details?.readyToStream || details?.status.state === 'ready') && details?.playback?.hls);
    const { data, error } = await db.rpc('complete_verified_moment_upload', {
      p_upload_id: upload.id, p_media_url: mediaUrl,
      p_video_ready: playable,
      p_playback_url: details?.playback?.hls ?? null, p_thumbnail_url: details?.thumbnail ?? null,
      p_duration: details?.duration ?? null,
    });
    if (error) throw error;
    // Encoding and host moderation are independent. Keep the original until
    // encoding succeeds, then show the host-review status and release it.
    return details && !playable ? { ...data, status: 'processing' } as UploadReceipt : data as UploadReceipt;
  }
  return receipt(upload);
}

export async function prepareDestination(upload: ServerUpload, restart = false, fresh = false): Promise<UploadReceipt> {
  const isVideo = upload.mime_type.startsWith('video/');
  if (!fresh && (upload.moment_id || upload.received_at || upload.object_path || upload.cf_video_uid)) {
    try {
      const result = await reconcileUpload(upload);
      if (result.status === 'error' && isVideo) restart = true;
      else if (result.status !== 'waiting') return result;
    } catch (error) {
      // Only an explicitly requested restart of an expired provider session may
      // create a new video; a transient provider outage must not discard progress.
      if (!(restart && isVideo && String(error).includes('404'))) throw error;
    }
  }
  if (isVideo) {
    if (!upload.cf_video_uid || restart) {
      const previousUid = upload.cf_video_uid;
      const created = await createTusDirectUpload(upload.file_size, {
        maxDurationSeconds: 3600, thumbnailTimestampPct: 0.1,
        meta: { eventId: upload.event_id, userId: upload.user_id, filename: upload.filename, uploadId: upload.id },
      });
      const db = uploadAdmin();
      let query = db.from('moment_uploads').update({ cf_video_uid: created.uid, upload_url: created.uploadURL, received_at: null });
      query = query.eq('id', upload.id);
      query = previousUid ? query.eq('cf_video_uid', previousUid) : query.is('cf_video_uid', null);
      const { data, error } = await query.select('*').maybeSingle();
      if (error || !data) {
        await deleteVideo(created.uid).catch(() => {});
        if (error) throw error;
        upload = await ownedUpload(upload.id, upload.user_id);
      } else {
        upload = data as ServerUpload;
        if (previousUid) await deleteVideo(previousUid).catch(() => {});
      }
    }
    return { id: upload.id, status: 'waiting', uploadUrl: upload.upload_url! };
  }
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'image/heic': 'heic', 'image/heif': 'heif' } as Record<string, string>)[upload.mime_type];
  const path = upload.object_path || `${upload.event_id}/${upload.user_id}/${upload.id}.${ext}`;
  if (!upload.object_path) {
    const { error } = await uploadAdmin().from('moment_uploads').update({ object_path: path }).eq('id', upload.id);
    if (error) throw error;
  }
  const provider = new R2StorageProvider();
  return { id: upload.id, status: 'waiting', uploadUrl: await provider.createPresignedUploadUrl('moments', path,
    { contentType: upload.mime_type, expiresIn: 3600 }) };
}

export async function recoverUnfinishedUploads(limit = 10): Promise<{ checked: number; finished: number }> {
  const db = uploadAdmin();
  const { data, error } = await db.from('moment_uploads').select('*').is('moment_id', null)
    .gt('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())
    .order('last_checked_at').limit(limit);
  if (error) throw error;
  let finished = 0;
  for (const item of data || []) {
    await db.from('moment_uploads').update({ last_checked_at: new Date().toISOString() }).eq('id', item.id);
    try { if ((await reconcileUpload(item as ServerUpload)).status !== 'waiting') finished++; }
    catch (error) { console.error('[uploads] Recovery pending', item.id, error instanceof Error ? error.message : 'Unknown error'); }
  }
  return { checked: data?.length || 0, finished };
}
