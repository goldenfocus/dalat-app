import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import type { NotificationMode } from '@/lib/types';
import type { PushNotificationContent, ChannelResult } from '../types';

// Configure VAPID details
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:hello@dalat.app`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/**
 * Create a service role Supabase client for push notifications.
 * Service role bypasses RLS so we can query any user's subscriptions.
 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('[push] Missing Supabase env vars:', {
      hasUrl: !!url,
      hasServiceKey: !!serviceKey,
    });
    return null;
  }

  return createClient(url, serviceKey);
}

interface PushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  notification_mode: NotificationMode;
}

interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  badgeCount?: number;
  requireInteraction?: boolean;
  notificationId?: string;
  notificationMode?: NotificationMode;
  actions?: Array<{
    action: string;
    title: string;
    url?: string;
  }>;
}

/**
 * Send push notification to a specific subscription.
 */
async function sendToSubscription(
  subscription: PushSubscription,
  payload: WebPushPayload
): Promise<{ success: boolean; expired?: boolean; error?: string }> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload)
    );
    return { success: true };
  } catch (error: unknown) {
    const webPushError = error as { statusCode?: number; message?: string };

    // 410 Gone or 404 means subscription is no longer valid
    if (webPushError.statusCode === 410 || webPushError.statusCode === 404) {
      return { success: false, expired: true, error: 'subscription_expired' };
    }

    console.error('[push] Notification error:', webPushError.message);
    return { success: false, error: webPushError.message };
  }
}

/**
 * Send push notification to all of a user's devices.
 * Returns count of successful sends and cleans up expired subscriptions.
 */
export async function sendPushNotification(
  userId: string,
  content: PushNotificationContent
): Promise<ChannelResult> {
  const supabase = createServiceClient();

  if (!supabase) {
    return {
      channel: 'push',
      success: false,
      error: 'Supabase service client not configured',
    };
  }

  // Get all subscriptions for this user
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, notification_mode')
    .eq('user_id', userId);

  if (error) {
    console.error('[push] Error fetching subscriptions:', error.message);
    return {
      channel: 'push',
      success: false,
      error: error.message,
    };
  }

  if (!subscriptions?.length) {
    console.log('[push] No subscriptions found for user:', userId);
    return {
      channel: 'push',
      success: true, // Not a failure, just no devices registered
    };
  }

  console.log(`[push] Sending to ${subscriptions.length} subscription(s) for user:`, userId);

  let sent = 0;
  let failed = 0;
  const expiredIds: string[] = [];

  // Build payload
  const payload: WebPushPayload = {
    title: content.title,
    body: content.body,
    url: content.primaryActionUrl,
    tag: content.tag,
    badgeCount: content.badge ?? 1,
    requireInteraction: content.requireInteraction,
    actions: content.actions,
  };

  // Send to all subscriptions in parallel
  await Promise.allSettled(
    subscriptions.map(async (sub: PushSubscription) => {
      // Include notification mode in payload
      const payloadWithMode: WebPushPayload = {
        ...payload,
        notificationMode: sub.notification_mode || 'sound_and_vibration',
      };

      const result = await sendToSubscription(sub, payloadWithMode);

      if (result.success) {
        sent++;
      } else {
        failed++;
        if (result.expired) {
          expiredIds.push(sub.id);
        }
      }
    })
  );

  // Clean up expired subscriptions
  if (expiredIds.length > 0) {
    console.log(`[push] Cleaning up ${expiredIds.length} expired subscription(s)`);
    await supabase.from('push_subscriptions').delete().in('id', expiredIds);
  }

  console.log(`[push] Result: ${sent} sent, ${failed} failed`);

  return {
    channel: 'push',
    success: sent > 0 || failed === 0, // Success if any sent or no subscriptions
  };
}

/**
 * Update badge count for all of a user's devices.
 */
export async function updateBadgeCount(userId: string, count: number): Promise<void> {
  await sendPushNotification(userId, {
    title: '',
    body: '',
    badge: count,
    tag: 'badge-update',
  });
}
