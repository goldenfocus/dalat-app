import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVideoStatus } from './use-video-status';

const pending = { id: 'first', cf_video_uid: 'cf-1', video_status: 'processing' as const };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('video completion recovery', () => {
  it('replaces stale processing state with playable metadata', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...pending, video_status: 'ready', cf_playback_url: 'https://example.com/video.m3u8' }) });
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(() => useVideoStatus(pending));
    await waitFor(() => expect(result.current.video_status).toBe('ready'));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retries a temporary failure and stops after becoming ready', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true, json: async () => ({ ...pending, video_status: 'ready' }) });
    vi.stubGlobal('fetch', fetcher);
    const { result, unmount } = renderHook(() => useVideoStatus(pending));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.video_status).toBe('ready');
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    unmount();
  });
  it('does not poll inactive or ready slides', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    renderHook(() => useVideoStatus(pending, false));
    renderHook(() => useVideoStatus({ ...pending, video_status: 'ready' }));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('ignores an old response after changing slides', async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolve = r; })));
    const { result, rerender } = renderHook(({ moment }) => useVideoStatus(moment), { initialProps: { moment: pending } });
    rerender({ moment: { ...pending, id: 'second', cf_video_uid: '' } });
    await act(async () => resolve({ ok: true, json: async () => ({ ...pending, video_status: 'ready' }) }));
    expect(result.current.id).toBe('second');
    expect(result.current.video_status).toBe('processing');
  });
});
