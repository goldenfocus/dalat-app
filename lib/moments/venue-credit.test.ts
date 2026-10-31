// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withVenueCredits } from './venue-credit';

describe('venue photo credits', () => {
  it('credits the venue without changing uploader ownership or other photos', async () => {
    const filter = vi.fn().mockResolvedValue({ error: null, data: [{ moment_id: 'drive', venue_id: 'venue',
      venues: { name: 'Social House Dalat', slug: 'social-house-dalat', logo_url: 'logo' } }] });
    const db = { from: () => ({ select: () => ({ in: filter }) }) } as unknown as SupabaseClient;
    const personal = { id: 'personal', user_id: 'owner', display_name: 'Yanik' };
    const result = await withVenueCredits(db, [{ id: 'drive', user_id: 'owner', display_name: 'Yanik' }, personal]);
    expect(result[0]).toMatchObject({ user_id: 'owner', display_name: 'Social House Dalat', credit_venue_slug: 'social-house-dalat', avatar_url: 'logo' });
    expect(result[1]).toBe(personal);
    expect(filter).toHaveBeenCalledWith('moment_id', ['drive', 'personal']);
  });
  it('does not invent credit when the lookup fails', async () => {
    const db = { from: () => ({ select: () => ({ in: async () => ({ error: { code: 'DOWN' } }) }) }) } as unknown as SupabaseClient;
    await expect(withVenueCredits(db, [{ id: 'photo' }])).rejects.toThrow('Moment credits unavailable');
  });
});
