import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { Tribe, TribeMember } from '@/lib/types';
const { refresh, replace } = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock('@/lib/i18n/routing', () => ({ useRouter: () => ({ refresh, replace }), Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { CommunityMemberMenu } from '@/components/tribes/community-member-menu';
const tribe = { slug: 'test', created_by: 'owner' } as Tribe;
const member = { user_id: 'member', status: 'active', role: 'member' } as TribeMember;
function mount(overrides = {}) { return render(<CommunityMemberMenu tribe={tribe} membership={member} isAdmin={false} canViewInsights={false} notificationsMuted={false} onEdit={vi.fn()} {...overrides} />); }
async function open() { fireEvent.keyDown(screen.getByRole('button', { name: 'settings' }), { key: 'Enter' }); await screen.findByRole('menu'); }
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ muted: true }) })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('community member menu', () => {
 it('gives regular members mute and leave without admin actions', async () => { mount(); await open(); expect(screen.getByText('memberMenu.mute')).toBeVisible(); expect(screen.getByText('leaveTribe')).toBeVisible(); expect(screen.queryByText('memberMenu.edit')).toBeNull(); });
 it('persists mute and changes the action to unmute', async () => { mount(); await open(); fireEvent.click(screen.getByText('memberMenu.mute')); await waitFor(() => expect(refresh).toHaveBeenCalled()); expect(fetch).toHaveBeenCalledWith('/api/tribes/test/notifications', expect.objectContaining({ body: '{"muted":true}' })); await open(); expect(screen.getByText('memberMenu.unmute')).toBeVisible(); });
 it('confirms before leaving and never modifies event RSVPs', async () => { mount(); await open(); fireEvent.click(screen.getByText('leaveTribe')); expect(fetch).not.toHaveBeenCalled(); expect(screen.getByText('memberMenu.leaveDescription')).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: 'leaveTribe' })); await waitFor(() => expect(replace).toHaveBeenCalledWith('/communities')); expect(fetch).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledWith('/api/tribes/test/membership', { method: 'DELETE' }); });
 it('keeps the confirmation open on a failed leave', async () => { vi.mocked(fetch).mockRejectedValue(new Error()); mount(); await open(); fireEvent.click(screen.getByText('leaveTribe')); fireEvent.click(screen.getByRole('button', { name: 'leaveTribe' })); expect(await screen.findByRole('alert')).toHaveTextContent('memberMenu.failed'); expect(replace).not.toHaveBeenCalled(); });
 it('sends owners to transfer ownership instead of deleting membership', async () => { mount({ membership: { ...member, user_id: 'owner', role: 'leader' }, isAdmin: true }); await open(); fireEvent.click(screen.getByText('leaveTribe')); expect(screen.getByText('memberMenu.transferFirst')).toBeVisible(); expect(screen.getByRole('link', { name: 'transferLeadership' })).toHaveAttribute('href', '#members'); expect(screen.queryByRole('button', { name: 'leaveTribe' })).toBeNull(); expect(fetch).not.toHaveBeenCalled(); });
 it('hides the menu for nonmembers', () => { mount({ membership: null }); expect(screen.queryByRole('button')).toBeNull(); });
});
