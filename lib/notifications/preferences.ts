import { createClient } from '@supabase/supabase-js';
import type {
  NotificationType,
  NotificationChannel,
  NotificationPreferences,
} from './types';

/**
 * Create a service role Supabase client.
 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey);
}

// Default channels for each notification type
const DEFAULT_CHANNELS: Record<NotificationType, NotificationChannel[]> = {
  // Event confirmations - in-app + push
  rsvp_confirmation: ['in_app', 'push'],

  // Reminders - in-app + push (time-sensitive)
  confirm_attendance_24h: ['in_app', 'push'],
  final_reminder_2h: ['in_app', 'push'],
  event_reminder: ['in_app', 'push'],

  // Waitlist - in-app + push (important updates)
  waitlist_promotion: ['in_app', 'push'],
  waitlist_position: ['in_app'],

  // Organizer notifications - in-app only
  new_rsvp: ['in_app'],

  // Post-event - in-app only
  feedback_request: ['in_app'],

  // Invitations - email for external, in-app + push for users
  event_invitation: ['email'],
  user_invitation: ['in_app', 'push'],

  // Tribe notifications - in-app + push
  tribe_join_request: ['in_app', 'push'],
  tribe_request_approved: ['in_app', 'push'],
  tribe_request_rejected: ['in_app'],
  tribe_new_event: ['in_app', 'push'],

  // Comment notifications - in-app + push for direct interactions
  comment_on_event: ['in_app', 'push'],
  comment_on_moment: ['in_app', 'push'],
  reply_to_comment: ['in_app', 'push'],
  // Thread activity is lower priority - in-app only
  thread_activity: ['in_app'],

  // Video processing notifications - in-app + push (user's content is ready)
  video_ready: ['in_app', 'push'],

  // Social notifications - in-app + push
  new_follower: ['in_app', 'push'],
};

/**
 * Get notification preferences for a user.
 * Returns default preferences if none are set.
 */
export async function getUserPreferences(
  userId: string
): Promise<NotificationPreferences | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    // No preferences set yet - that's fine, we'll use defaults
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[preferences] Error fetching preferences:', error.message);
    return null;
  }

  return data as NotificationPreferences;
}

/**
 * Get the channels to send a notification to for a user.
 * Respects user preferences and global toggles.
 */
export async function getChannelsForNotification(
  userId: string,
  type: NotificationType
): Promise<NotificationChannel[]> {
  const preferences = await getUserPreferences(userId);

  // Start with default channels for this notification type
  let channels = DEFAULT_CHANNELS[type] || ['in_app'];

  // If user has custom preferences for this type, use those
  if (preferences?.channel_preferences?.[type]) {
    channels = preferences.channel_preferences[type];
  }

  // Filter by global toggles
  if (preferences) {
    channels = channels.filter((channel) => {
      switch (channel) {
        case 'in_app':
          return preferences.in_app_enabled;
        case 'push':
          return preferences.push_enabled;
        case 'email':
          return preferences.email_enabled;
        default:
          return true;
      }
    });
  }

  // Check quiet hours for push notifications
  if (preferences?.quiet_hours_enabled && channels.includes('push')) {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });

    const isQuietHours = isInQuietHours(
      currentTime,
      preferences.quiet_hours_start,
      preferences.quiet_hours_end
    );

    if (isQuietHours) {
      channels = channels.filter((c) => c !== 'push');
    }
  }

  return channels;
}

/**
 * Check if current time is within quiet hours.
 */
function isInQuietHours(
  currentTime: string,
  startTime: string,
  endTime: string
): boolean {
  // Handle overnight quiet hours (e.g., 22:00 to 08:00)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime <= endTime;
  }
  return currentTime >= startTime && currentTime <= endTime;
}

/**
 * Get default channels for a notification type.
 */
export function getDefaultChannels(type: NotificationType): NotificationChannel[] {
  return DEFAULT_CHANNELS[type] || ['in_app'];
}

/**
 * Update user notification preferences.
 */
export async function updateUserPreferences(
  userId: string,
  updates: Partial<Omit<NotificationPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<boolean> {
  const supabase = createServiceClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('notification_preferences')
    .upsert({
      user_id: userId,
      ...updates,
    }, {
      onConflict: 'user_id',
    });

  if (error) {
    console.error('[preferences] Error updating preferences:', error.message);
    return false;
  }

  return true;
}
