import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadJob } from '@/lib/uploads/types';

const mocks = vi.hoisted(() => ({
  state: { jobs: [] as UploadJob[], userId: 'user', ready: true, staging: 0 },
  success: vi.fn(), info: vi.fn(), error: vi.fn(), dismiss: vi.fn(), push: vi.fn(),
}));
vi.mock('./event-uploader', () => ({ useEventUploads: () => mocks.state }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/lib/i18n/routing', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('sonner', () => ({
  toast: { success: mocks.success, info: mocks.info, error: mocks.error, dismiss: mocks.dismiss },
  Toaster: () => null,
}));
import { UploadNotifications } from './upload-notifications';

const video = (phase: UploadJob['phase']): UploadJob => ({
  id: 'job', batchId: 'batch', userId: 'user', eventId: 'event', eventSlug: 'potluck',
  eventTitle: 'Potluck', name: 'video.mp4', size: 10, mime: 'video/mp4', isVideo: true,
  createdAt: 1, progress: 0, durable: true, locale: 'en', phase,
});
beforeEach(() => { vi.clearAllMocks(); mocks.state = { jobs: [], userId: 'user', ready: true, staging: 0 }; });
afterEach(cleanup);

describe('upload notification presentation', () => {
  it('renders no footer and never navigates unless the optional action is clicked', () => {
    mocks.state.jobs = [video('uploading')];
    const { container, rerender } = render(<UploadNotifications />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.success).not.toHaveBeenCalled();
    mocks.state = { ...mocks.state, jobs: [video('processing')] };
    rerender(<UploadNotifications />);
    expect(mocks.info).toHaveBeenCalledWith('done', expect.objectContaining({ closeButton: true, dismissible: true, duration: 5000 }));
    expect(mocks.push).not.toHaveBeenCalled();
    mocks.state = { ...mocks.state, jobs: [video('published')] };
    rerender(<UploadNotifications />);
    expect(mocks.success).toHaveBeenCalledWith('readyNotice', expect.objectContaining({ closeButton: true, dismissible: true, duration: 5000 }));
    expect(mocks.push).not.toHaveBeenCalled();
    act(() => mocks.success.mock.calls[0][1].action.onClick());
    expect(mocks.push).toHaveBeenCalledWith('/events/potluck/moments');
  });

  it('keeps an error recoverable without a persistent overlay and clears private notices on sign-out', () => {
    mocks.state.jobs = [video('error')];
    const { rerender } = render(<UploadNotifications />);
    expect(mocks.error).toHaveBeenCalledWith('attentionNotice', expect.objectContaining({ closeButton: true, duration: 8000 }));
    act(() => mocks.error.mock.calls[0][1].action.onClick());
    expect(mocks.push).toHaveBeenCalledWith('/events/potluck/moments/new');
    mocks.state = { ...mocks.state, userId: '', jobs: [] };
    rerender(<UploadNotifications />);
    expect(mocks.dismiss).toHaveBeenCalledWith('upload:user:batch');
  });
});
