import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  verifyWebhookSignature,
  getVideoDetails,
  type CloudflareWebhookEvent,
} from '@/lib/cloudflare-stream';
import { notify } from '@/lib/notifications';

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase service configuration missing');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('Webhook-Signature') ?? '';

  if (!verifyWebhookSignature(body, signature)) {
    console.error('Invalid webhook signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: CloudflareWebhookEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log('Cloudflare webhook event:', event.type, event.uid);

  const supabase = getServiceClient();

  try {
    switch (event.type) {
      case 'live_input.connected': {
        const { error } = await supabase
          .from('live_streams')
          .update({ status: 'live', started_at: new Date().toISOString() })
          .eq('cf_live_input_id', event.uid);
        if (error) console.error('Failed to update stream to live:', error);
        break;
      }

      case 'live_input.disconnected': {
        const { data: stream } = await supabase
          .from('live_streams')
          .select('status')
          .eq('cf_live_input_id', event.uid)
          .single();

        if (stream && stream.status === 'live') {
          const { error } = await supabase
            .from('live_streams')
            .update({ status: 'reconnecting' })
            .eq('cf_live_input_id', event.uid);
          if (error) console.error('Failed to update stream to reconnecting:', error);
        }
        break;
      }

      case 'video.ready': {
        // Handle both live stream recordings and VOD uploads
        if (event.liveInput?.uid) {
          // Live stream recording is ready
          console.log('Recording ready for live input:', event.liveInput.uid, 'Video UID:', event.video?.uid);
        } else {
          // VOD upload is ready - update the moment
          const videoUid = event.uid;
          console.log('VOD video ready:', videoUid);

          try {
            // Get video details - includes correct playback URLs from Cloudflare
            const videoDetails = await getVideoDetails(videoUid);

            // Use URLs directly from Cloudflare API (not constructed)
            const playbackUrl = videoDetails.playback?.hls;
            const thumbnailUrl = videoDetails.thumbnail;

            if (!playbackUrl) {
              console.error('No playback URL in video details:', videoUid);
              return NextResponse.json({ error: 'No playback URL' }, { status: 500 });
            }

            // Update moment with all video metadata including thumbnail
            const { data: moment, error } = await supabase
              .from('moments')
              .update({
                video_status: 'ready',
                cf_playback_url: playbackUrl,
                thumbnail_url: thumbnailUrl ?? null,
                video_duration_seconds: videoDetails.duration ?? null,
              })
              .eq('cf_video_uid', videoUid)
              .select('id, user_id, event_id')
              .single();

            if (error) {
              console.error('Failed to update moment video status:', error);
            } else if (moment) {
              console.log('Updated moment:', moment.id, 'to ready status with thumbnail');

              // Send push notification to the user: "Your video is ready!"
              // Get event details for the notification
              const { data: eventData } = await supabase
                .from('events')
                .select('slug, title')
                .eq('id', moment.event_id)
                .single();

              if (eventData && moment.user_id) {
                console.log(`[video.ready] Sending notification to user ${moment.user_id}`);
                await notify({
                  type: 'video_ready',
                  userId: moment.user_id,
                  locale: 'en', // Default to English - user's preferred locale would need to be fetched
                  eventSlug: eventData.slug,
                  eventTitle: eventData.title,
                  momentId: moment.id,
                  thumbnailUrl: thumbnailUrl ?? undefined,
                });
              }
            } else {
              // No moment found with this video UID - might be a live recording
              console.log('No moment found for video UID:', videoUid);
            }
          } catch (err) {
            console.error('Error processing video.ready:', err);
          }
        }
        break;
      }

      case 'video.error': {
        const videoUid = event.uid;
        console.error('Cloudflare video error:', event);

        // Update moment to error status
        const { data, error } = await supabase.rpc('update_moment_video_status', {
          p_cf_video_uid: videoUid,
          p_video_status: 'error',
        });

        if (error) {
          console.error('Failed to update moment video status to error:', error);
        } else if (data) {
          console.log('Updated moment:', data, 'to error status');
        }
        break;
      }

      default:
        console.log('Unhandled webhook event type:', event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
