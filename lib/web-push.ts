import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import type { NotificationMode } from '@/lib/types';

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
    console.error('[web-push] Missing Supabase env vars:', {
      hasUrl: !!url,
      hasServiceKey: !!serviceKey,
    });
    return null;
  }

  return createClient(url, serviceKey);
}

export interface PushNotificationPayload {
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

interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send push notification to a specific subscription
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushNotificationPayload
): Promise<{ success: boolean; error?: string }> {
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
      return { success: false, error: 'subscription_expired' };
    }

    console.error('Push notification error:', webPushError.message);
    return { success: false, error: webPushError.message };
  }
}

/**
 * Send push notification to all of a user's devices
 * Returns count of successful sends and cleans up expired subscriptions
 */
export async function sendPushToUser(
  userId: string,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  const supabase = createServiceClient();

  if (!supabase) {
    console.error('[web-push] Cannot send push: service client not configured');
    return { sent: 0, failed: 0 };
  }

  // Get all subscriptions for this user (service role bypasses RLS)
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, notification_mode')
    .eq('user_id', userId);

  if (error) {
    console.error('[web-push] Error fetching subscriptions:', error.message);
    return { sent: 0, failed: 0 };
  }

  if (!subscriptions?.length) {
    console.log('[web-push] No subscriptions found for user:', userId);
    return { sent: 0, failed: 0 };
  }

  console.log(`[web-push] Sending to ${subscriptions.length} subscription(s) for user:`, userId);

  let sent = 0;
  let failed = 0;
  const expiredIds: string[] = [];

  // Send to all subscriptions in parallel
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      // Include notification mode and badge count in payload
      const payloadWithMode: PushNotificationPayload = {
        ...payload,
        badgeCount: payload.badgeCount ?? 1,
        notificationMode: (sub.notification_mode as NotificationMode) || 'sound_and_vibration',
      };

      const result = await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payloadWithMode
      );

      if (result.success) {
        sent++;
      } else {
        failed++;
        if (result.error === 'subscription_expired') {
          expiredIds.push(sub.id);
        }
      }
    })
  );

  // Clean up expired subscriptions
  if (expiredIds.length > 0) {
    console.log(`[web-push] Cleaning up ${expiredIds.length} expired subscription(s)`);
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('id', expiredIds);
  }

  console.log(`[web-push] Result: ${sent} sent, ${failed} failed`);
  return { sent, failed };
}

/**
 * Update badge count for all of a user's devices
 */
export async function updateBadgeCount(
  userId: string,
  count: number
): Promise<void> {
  await sendPushToUser(userId, {
    title: '',
    body: '',
    badgeCount: count,
    tag: 'badge-update',
  });
}
