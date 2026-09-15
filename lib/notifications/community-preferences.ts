import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationPayload } from './types';

/** Community broadcasts respect mute before any channel is selected.
 * RSVP confirmations/reminders are personal event notifications and stay enabled.
 */
export async function isCommunityNotificationMuted(db: SupabaseClient | null, payload: NotificationPayload): Promise<boolean> {
  if (payload.type !== 'tribe_new_event' && payload.type !== 'tribe_join_request') return false;
  if (!db) return true; // Do not send a broadcast when its preference cannot be checked.
  const lookup = payload.type === 'tribe_new_event'
    ? await db.from('events').select('tribe_id').eq('slug', payload.eventSlug).maybeSingle()
    : await db.from('tribes').select('id').eq('slug', payload.tribeSlug).maybeSingle();
  if (lookup.error || !lookup.data) return true;
  const tribeId = 'tribe_id' in lookup.data ? lookup.data.tribe_id : lookup.data.id;
  if (!tribeId) return true;
  const { data: member, error: memberError } = await db.from('tribe_members').select('status')
    .eq('tribe_id', tribeId).eq('user_id', payload.userId).maybeSingle();
  if (memberError || member?.status !== 'active') return true;
  const { data, error } = await db.from('community_notification_preferences').select('muted')
    .eq('tribe_id', tribeId).eq('user_id', payload.userId).maybeSingle();
  return !!error || data?.muted === true;
}
