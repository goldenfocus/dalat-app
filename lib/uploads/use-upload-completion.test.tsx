import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), confetti: vi.fn() }));
vi.mock('@/lib/i18n/routing', () => ({ useRouter: () => mocks }));
vi.mock('canvas-confetti', () => ({ default: mocks.confetti }));
import { useUploadCompletion } from './use-upload-completion';

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); document.body.innerHTML = ''; vi.useRealTimers(); });
const advance = () => act(() => vi.advanceTimersByTime(2000));
describe('upload completion', () => {
  it('celebrates once and returns to the album after the final upload is saved', () => {
    const { rerender } = renderHook(({ busy, done }) => useUploadCompletion('event', 'my-event', busy, done),
      { initialProps: { busy: true, done: false } });
    advance(); expect(mocks.replace).not.toHaveBeenCalled();
    rerender({ busy: false, done: true });
    expect(mocks.confetti).toHaveBeenCalledWith(expect.objectContaining({ disableForReducedMotion: true }));
    advance();
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/events/my-event/moments');
    expect(mocks.refresh).toHaveBeenCalledOnce();
    rerender({ busy: false, done: true }); advance(); expect(mocks.confetti).toHaveBeenCalledOnce();
  });
  it('does not redirect on restored completed receipts or failed/paused jobs', () => {
    const { rerender } = renderHook(({ busy, done }) => useUploadCompletion('event', 'my-event', busy, done),
      { initialProps: { busy: false, done: true } });
    advance(); expect(mocks.confetti).not.toHaveBeenCalled();
    rerender({ busy: true, done: false }); advance(); expect(mocks.replace).not.toHaveBeenCalled();
  });
  it('waits for an open caption editor, and cancels navigation when more files arrive', () => {
    const { rerender } = renderHook(({ busy, done }) => useUploadCompletion('event', 'my-event', busy, done),
      { initialProps: { busy: true, done: false } });
    document.body.innerHTML = '<div data-caption-editing></div>';
    rerender({ busy: false, done: true }); advance(); expect(mocks.replace).not.toHaveBeenCalled();
    document.body.innerHTML = '';
    rerender({ busy: true, done: false }); advance(); expect(mocks.replace).not.toHaveBeenCalled();
    rerender({ busy: false, done: true }); advance(); expect(mocks.replace).toHaveBeenCalledOnce();
  });
  it('cancels navigation when leaving the upload page', () => {
    const { rerender, unmount } = renderHook(({ busy, done }) => useUploadCompletion('event', 'my-event', busy, done),
      { initialProps: { busy: true, done: false } });
    rerender({ busy: false, done: true }); unmount(); advance(); expect(mocks.replace).not.toHaveBeenCalled();
  });
});
