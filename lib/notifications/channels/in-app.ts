import { createClient } from '@supabase/supabase-js';
import type {
  NotificationContent,
  NotificationType,
  ChannelResult,
} from '../types';

/**
 * Create a service role Supabase client for inserting notifications.
 * Service role bypasses RLS so we can insert notifications for any user.
 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('[in-app] Missing Supabase env vars:', {
      hasUrl: !!url,
      hasServiceKey: !!serviceKey,
    });
    return null;
  }

  return createClient(url, serviceKey);
}

export interface InAppNotificationOptions {
  userId: string;
  type: NotificationType;
  content: NotificationContent;
  metadata?: Record<string, unknown>;
}

/**
 * Send an in-app notification by inserting into the notifications table.
 * The notification will be delivered in real-time via Supabase Realtime.
 */
export async function sendInAppNotification(
  options: InAppNotificationOptions
): Promise<ChannelResult> {
  const { userId, type, content, metadata = {} } = options;

  const supabase = createServiceClient();

  if (!supabase) {
    return {
      channel: 'in_app',
      success: false,
      error: 'Supabase service client not configured',
    };
  }

  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title: content.title,
        body: content.body || null,
        primary_action_url: content.primaryActionUrl || null,
        primary_action_label: content.primaryActionLabel || null,
        secondary_action_url: content.secondaryActionUrl || null,
        secondary_action_label: content.secondaryActionLabel || null,
        metadata,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[in-app] Failed to insert notification:', error.message);
      return {
        channel: 'in_app',
        success: false,
        error: error.message,
      };
    }

    console.log('[in-app] Notification inserted:', data.id);
    return {
      channel: 'in_app',
      success: true,
      messageId: data.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[in-app] Exception inserting notification:', message);
    return {
      channel: 'in_app',
      success: false,
      error: message,
    };
  }
}

/**
 * Mark a notification as read.
 */
export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<boolean> {
  const supabase = createServiceClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId);

  return !error;
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllNotificationsRead(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  if (!supabase) return false;

  const { error } = await supabase.rpc('mark_all_notifications_read', {
    p_user_id: userId,
  });

  return !error;
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = createServiceClient();
  if (!supabase) return 0;

  const { data, error } = await supabase.rpc('get_unread_notification_count', {
    p_user_id: userId,
  });

  if (error) {
    console.error('[in-app] Failed to get unread count:', error.message);
    return 0;
  }

  return data || 0;
}
