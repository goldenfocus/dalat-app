import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmAttendanceHandler } from './confirm-attendance-handler';

const refresh = vi.fn();
const replace = vi.fn();
const rpc = vi.fn();
const router = { refresh, replace };

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc }),
}));

describe('ConfirmAttendanceHandler dismissal', () => {
  beforeEach(() => {
    refresh.mockReset();
    replace.mockReset().mockImplementation((path: string) => {
      window.history.replaceState({}, '', path);
    });
    rpc.mockReset().mockResolvedValue({ error: null });
    window.history.replaceState({}, '', '/events/community-meetup?confirm=yes');
  });

  async function renderConfirmedModal() {
    render(<ConfirmAttendanceHandler eventId="event-1" />);
    expect(await screen.findByText("You're confirmed!")).toBeInTheDocument();
    replace.mockClear();
  }

  it('closes from the X button', async () => {
    await renderConfirmedModal();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/events/community-meetup');
  });

  it('closes when Escape is pressed', async () => {
    await renderConfirmedModal();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/events/community-meetup');
  });

  it('closes on the backdrop but not on the card', async () => {
    await renderConfirmedModal();
    const dialog = screen.getByRole('dialog');

    fireEvent.click(screen.getByText("You're confirmed!"));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(dialog);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(replace).toHaveBeenCalledWith('/events/community-meetup');
  });
});
