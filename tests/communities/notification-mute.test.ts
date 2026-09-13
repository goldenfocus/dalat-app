// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationPayload } from '@/lib/notifications/types';
import { isCommunityNotificationMuted } from '@/lib/notifications/community-preferences';
const payload = { type: 'tribe_new_event', userId: 'user', eventSlug: 'event' } as NotificationPayload;
function db(muted: boolean | null, failed = false, active = true) {
 const from = vi.fn((table: string) => {
  const q = { select: () => q, eq: vi.fn(() => q), maybeSingle: async () => table === 'events' ? { data: { tribe_id: 'community' }, error: null } : table === 'tribe_members' ? { data: active ? { status: 'active' } : null, error: null } : { data: muted === null ? null : { muted }, error: failed ? {} : null } };
  return q;
 });
 return { from } as unknown as SupabaseClient;
}
describe('community broadcast preferences', () => {
 it('suppresses a muted community broadcast', async () => expect(await isCommunityNotificationMuted(db(true), payload)).toBe(true));
 it('allows unmuted and unset preferences', async () => { expect(await isCommunityNotificationMuted(db(false), payload)).toBe(false); expect(await isCommunityNotificationMuted(db(null), payload)).toBe(false); });
 it('fails closed when the preference cannot be checked', async () => { expect(await isCommunityNotificationMuted(db(false, true), payload)).toBe(true); expect(await isCommunityNotificationMuted(null, payload)).toBe(true); });
 it('does not send community broadcasts after a member leaves', async () => expect(await isCommunityNotificationMuted(db(false, false, false), payload)).toBe(true));
 it('does not suppress RSVP reminders or personal notifications', async () => { const client = db(true); expect(await isCommunityNotificationMuted(client, { type: 'event_reminder' } as NotificationPayload)).toBe(false); expect(client.from).not.toHaveBeenCalled(); });
});
