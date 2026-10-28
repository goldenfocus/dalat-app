import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CelebrationProvider, RsvpButton } from './rsvp-button';
import { FloatingRsvpBar } from './floating-rsvp-bar';

const { startSignupIntent, rpc, router } = vi.hoisted(() => ({ startSignupIntent: vi.fn().mockResolvedValue(undefined), rpc: vi.fn(), router: { refresh: vi.fn() } }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/auth/start-intent', () => ({ startSignupIntent }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }));
vi.mock('@/lib/communities/celebration-audio', () => ({ prepareCelebrationAudio: vi.fn() }));
vi.mock('./community-rsvp', () => ({ useCommunityRsvp: () => ({ eventSlug: 'exchange', join: false }), CommunityRsvpChoice: () => <span>community choice</span> }));
vi.mock('./rsvp-celebration', () => ({ RsvpCelebration: () => null }));
vi.mock('./event-feedback', () => ({ EventFeedback: () => null }));
vi.mock('@/components/questionnaire', () => ({ QuestionnaireFlow: () => null }));
const props = { eventId: 'event-1', eventSlug: 'exchange', eventTitle: 'Exchange', eventDescription: null, eventImageUrl: null, capacity: null, goingSpots: 0, currentRsvp: null, isLoggedIn: false, waitlistPosition: null, startsAt: '2099-10-28T11:00:00Z', endsAt: '2099-10-28T13:00:00Z' };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('guest event joining', () => {
  it('offers one sign-in action, no RSVP choices, and carries event intent to authentication', async () => {
    render(<RsvpButton {...props} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('community choice')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'signInToJoin' }));
    await waitFor(() => expect(startSignupIntent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'event', slug: 'exchange' })));
    expect(rpc).not.toHaveBeenCalled();
  });
  it('keeps the floating guest action explicit and shows no community upsell', () => {
    render(<CelebrationProvider><FloatingRsvpBar {...props} /></CelebrationProvider>);
    // Floating action correctly starts hidden while the inline action is visible.
    expect(screen.queryByText('imGoing')).toBeNull();
    expect(screen.queryByText('community choice')).toBeNull();
  });
  it('retains RSVP and interested choices for signed-in visitors', () => {
    render(<RsvpButton {...props} isLoggedIn />);
    expect(screen.getByRole('button', { name: 'imGoing' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'interested' })).toBeVisible();
    expect(screen.queryByText('signInToJoin')).toBeNull();
  });
});
