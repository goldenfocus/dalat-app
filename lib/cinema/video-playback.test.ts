import { describe, expect, it, vi } from "vitest";

import { requestVideoPlayback } from "./video-playback";

describe("requestVideoPlayback", () => {
  it("plays with the requested sound state", async () => {
    const video = {
      muted: true,
      play: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLVideoElement;

    await expect(requestVideoPlayback(video, true)).resolves.toBe(true);
    expect(video.muted).toBe(false);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it("keeps video sound requested when a browser blocks autoplay", async () => {
    const video = {
      muted: false,
      play: vi.fn().mockRejectedValue(new DOMException("Blocked", "NotAllowedError")),
    } as unknown as HTMLVideoElement;

    await expect(requestVideoPlayback(video, true)).resolves.toBe(false);
    expect(video.muted).toBe(false);
    expect(video.play).toHaveBeenCalledOnce();
  });

  it("keeps the slide moving silently after audible autoplay is blocked", async () => {
    const video = {
      muted: false,
      play: vi.fn()
        .mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined),
    } as unknown as HTMLVideoElement;

    await expect(requestVideoPlayback(video, true, true)).resolves.toBe(true);
    expect(video.muted).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(2);

    await expect(requestVideoPlayback(video, true, true)).resolves.toBe(true);
    expect(video.muted).toBe(false);
  });

  it("does not hide a broken media source behind muted autoplay", async () => {
    const video = {
      muted: false,
      play: vi.fn().mockRejectedValue(new DOMException("Unavailable", "NotSupportedError")),
    } as unknown as HTMLVideoElement;

    await expect(requestVideoPlayback(video, true, true)).resolves.toBe(false);
    expect(video.muted).toBe(false);
    expect(video.play).toHaveBeenCalledOnce();
  });

  it("keeps the retry control visible when playback still fails", async () => {
    const video = {
      muted: true,
      play: vi.fn().mockRejectedValue(new DOMException("Unavailable", "NotSupportedError")),
    } as unknown as HTMLVideoElement;

    await expect(requestVideoPlayback(video, false)).resolves.toBe(false);
    expect(video.play).toHaveBeenCalledOnce();
  });
});
