import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyWebhookSignature, type CloudflareWebhookEvent } from '@/lib/cloudflare-stream';

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
        if (event.liveInput?.uid) {
          console.log('Recording ready for live input:', event.liveInput.uid, 'Video UID:', event.video?.uid);
        }
        break;
      }

      case 'video.error': {
        console.error('Cloudflare video error:', event);
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
