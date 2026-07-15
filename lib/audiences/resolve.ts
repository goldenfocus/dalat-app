import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENT_TAGS, type EventTag } from '@/lib/constants/event-tags';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

/** Tag audiences look at RSVPs within this window — "actually plays games", not "clicked interested once in January" */
const TAG_WINDOW_DAYS = 120;
/** A user receives at most one audience blast per this window (notification-fatigue guard) */
export const BLAST_COOLDOWN_DAYS = 30;

export type AudienceKey = 'all' | EventTag;

/**
 * PostgREST silently caps unbounded selects at 1000 rows — enough to truncate
 * both audience membership AND the exclusion set once the community grows.
 * Explicit ceiling with lots of headroom (177 users today); paginate before we near it.
 */
const ROW_CEILING = 5000;

export function isValidAudienceKey(key: string): key is AudienceKey {
  return key === 'all' || (EVENT_TAGS as readonly string[]).includes(key);
}

export function subtractExclusions(memberIds: string[], excluded: Set<string>): string[] {
  return [...new Set(memberIds)].filter((id) => !excluded.has(id));
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Resolve an audience key to member user ids (no exclusions applied).
 * Throws on query errors — callers surface them; no silent [].
 */
export async function resolveAudienceMembers(
  admin: AnySupabaseClient,
  key: AudienceKey
): Promise<string[]> {
  if (key === 'all') {
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq('is_ghost', false)
      .limit(ROW_CEILING);
    if (error) throw new Error(`resolveAudienceMembers(all): ${error.message}`);
    return (data ?? []).map((r: { id: string }) => r.id);
  }

  // Users who RSVP'd going/interested to events carrying this tag, recently
  const { data, error } = await admin
    .from('rsvps')
    .select('user_id, events!inner(id)')
    .in('status', ['going', 'interested'])
    .gte('created_at', daysAgoIso(TAG_WINDOW_DAYS))
    .contains('events.ai_tags', [key])
    .limit(ROW_CEILING);
  if (error) throw new Error(`resolveAudienceMembers(${key}): ${error.message}`);
  return [...new Set((data ?? []).map((r: { user_id: string }) => r.user_id))];
}

/**
 * User ids that must NOT receive this blast:
 * already invited to the event, already RSVP'd, the sender,
 * anyone blasted in the last 30 days, anyone who muted audience blasts entirely.
 */
export async function getBlastExclusions(
  admin: AnySupabaseClient,
  eventId: string,
  senderId: string
): Promise<Set<string>> {
  const [invited, rsvped, recentlyBlasted, prefs] = await Promise.all([
    admin
      .from('event_invitations')
      .select('claimed_by')
      .eq('event_id', eventId)
      .not('claimed_by', 'is', null)
      .limit(ROW_CEILING),
    admin.from('rsvps').select('user_id').eq('event_id', eventId).limit(ROW_CEILING),
    admin
      .from('event_invitations')
      .select('claimed_by')
      .not('audience', 'is', null)
      .not('claimed_by', 'is', null)
      .gte('created_at', daysAgoIso(BLAST_COOLDOWN_DAYS))
      .limit(ROW_CEILING),
    admin
      .from('notification_preferences')
      .select('user_id, channel_preferences')
      .limit(ROW_CEILING),
  ]);

  for (const q of [invited, rsvped, recentlyBlasted, prefs]) {
    if (q.error) throw new Error(`getBlastExclusions: ${q.error.message}`);
  }

  const excluded = new Set<string>([senderId]);
  for (const r of (invited.data ?? []) as Array<{ claimed_by: string | null }>) {
    if (r.claimed_by) excluded.add(r.claimed_by);
  }
  for (const r of (rsvped.data ?? []) as Array<{ user_id: string }>) {
    excluded.add(r.user_id);
  }
  for (const r of (recentlyBlasted.data ?? []) as Array<{ claimed_by: string | null }>) {
    if (r.claimed_by) excluded.add(r.claimed_by);
  }
  for (const r of (prefs.data ?? []) as Array<{ user_id: string; channel_preferences: Record<string, string[]> | null }>) {
    const chans = r.channel_preferences?.audience_invitation;
    if (Array.isArray(chans) && chans.length === 0) excluded.add(r.user_id);
  }
  return excluded;
}

/**
 * Distinct-user counts per tag over the window, plus 'all'.
 * One query for all tags — aggregate in JS (fine at this scale).
 */
export async function getAudienceCounts(
  admin: AnySupabaseClient
): Promise<Array<{ key: AudienceKey; count: number }>> {
  const [allMembers, tagRows] = await Promise.all([
    resolveAudienceMembers(admin, 'all'),
    admin
      .from('rsvps')
      .select('user_id, events!inner(ai_tags)')
      .in('status', ['going', 'interested'])
      .gte('created_at', daysAgoIso(TAG_WINDOW_DAYS))
      .limit(ROW_CEILING),
  ]);
  if (tagRows.error) throw new Error(`getAudienceCounts: ${tagRows.error.message}`);

  const perTag = new Map<string, Set<string>>();
  for (const row of (tagRows.data ?? []) as Array<{ user_id: string; events: unknown }>) {
    const tags = (row.events as { ai_tags: string[] | null } | null)?.ai_tags ?? [];
    for (const tag of tags) {
      if (!(EVENT_TAGS as readonly string[]).includes(tag)) continue;
      if (!perTag.has(tag)) perTag.set(tag, new Set());
      perTag.get(tag)!.add(row.user_id);
    }
  }

  const result: Array<{ key: AudienceKey; count: number }> = [
    { key: 'all', count: allMembers.length },
  ];
  for (const [tag, users] of perTag) {
    if (users.size > 0) result.push({ key: tag as EventTag, count: users.size });
  }
  // 'all' first, then biggest audiences
  result.sort((a, b) => (a.key === 'all' ? -1 : b.key === 'all' ? 1 : b.count - a.count));
  return result;
}
