import { describe, expect, it, vi } from 'vitest';
import { locales } from '@/lib/i18n/locales';
import { getDefaultChannels } from './preferences';
import { getNotificationTemplate } from './templates';

describe('claim review alerts', () => {
  it('links both kinds of claims to the exact row in every locale and uses the bell', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dalat.app');
    try {
      for (const locale of locales) {
        const shared = { type: 'venue_claim_review' as const, claimId: 'claim-id', userId: 'reviewer-id', locale };
        const venue = getNotificationTemplate({ ...shared, venueName: 'Sambodhi Coffee' });
        const organizer = getNotificationTemplate({ ...shared, organizerName: 'Phương Lily' });
        const path = `${locale === 'en' ? '' : `/${locale}`}/admin/venue-claims#claim-claim-id`;
        expect(venue.inApp.primaryActionUrl).toBe(`https://dalat.app${path}`);
        expect(organizer.inApp.primaryActionUrl).toBe(`https://dalat.app${path}`);
        expect(venue.inApp.body).toBe('Sambodhi Coffee');
        expect(organizer.inApp.body).toBe('Phương Lily');
        expect(venue.inApp.title).not.toBe(organizer.inApp.title);
        expect(venue.email).toBeUndefined();
        expect(organizer.email).toBeUndefined();
      }
      expect(getDefaultChannels('venue_claim_review')).toEqual(['in_app']);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
