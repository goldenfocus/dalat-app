import { describe, expect, it, vi } from 'vitest';
import { locales } from '@/lib/i18n/locales';
import { getNotificationTemplate } from './templates';

describe('venue claim review alerts', () => {
  it('links each locale to the exact claim and preserves the destination through login', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dalat.app');
    try {
      for (const locale of locales) {
        const template = getNotificationTemplate({
          type: 'venue_claim_review',
          claimId: 'claim-id',
          venueName: 'Chocoland <Atelier>',
          userId: 'reviewer-id',
          locale,
        });
        const path = `${locale === 'en' ? '' : `/${locale}`}/admin/venue-claims#claim-claim-id`;
        expect(template.inApp.primaryActionUrl).toBe(`https://dalat.app${path}`);
        const emailLink = new URL(template.email!.primaryActionUrl!);
        expect(emailLink.pathname).toBe('/auth/continue');
        expect(emailLink.searchParams.get('next')).toBe(path);
        expect(template.email!.html).toContain('Chocoland &lt;Atelier&gt;');
        expect(template.email!.text).toContain('Chocoland <Atelier>');
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
