import type { SupabaseClient } from '@supabase/supabase-js';

export interface VenueCredit { credit_venue_id?: string; credit_venue_slug?: string }

/** Public presentation credit is separate from the uploader's audit/permission identity. */
export async function withVenueCredits<T extends { id: string }>(db: SupabaseClient, moments: T[]): Promise<(T & VenueCredit)[]> {
  if (!moments.length) return moments;
  const { data, error } = await db.from('moment_venue_credits')
    .select('moment_id,venue_id,venues!inner(name,slug,logo_url)')
    .in('moment_id', moments.map(moment => moment.id));
  if (error) throw new Error(`Moment credits unavailable: ${error.code}`);
  const credits = new Map((data || []).map(row => [row.moment_id, row]));
  return moments.map(moment => {
    const credit = credits.get(moment.id);
    if (!credit) return moment;
    const venue = (Array.isArray(credit.venues) ? credit.venues[0] : credit.venues) as { name: string; slug: string; logo_url: string | null };
    return { ...moment, credit_venue_id: credit.venue_id, credit_venue_slug: venue.slug,
      display_name: venue.name, avatar_url: venue.logo_url };
  });
}

export async function withGroupVenueCredits<T extends { moments: { id: string }[] }>(db: SupabaseClient, groups: T[]): Promise<T[]> {
  const credited = await withVenueCredits(db, groups.flatMap(group => group.moments));
  const byId = new Map(credited.map(moment => [moment.id, moment]));
  return groups.map(group => ({ ...group, moments: group.moments.map(moment => byId.get(moment.id) || moment) }));
}
