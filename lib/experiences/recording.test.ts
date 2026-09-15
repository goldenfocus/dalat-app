// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { archiveLiveAudio } from "./recording";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("continuous live archival", () => {
  it("rotates complete files without stopping the microphone and flushes on finish", async () => {
    vi.useFakeTimers();
    class Recorder {
      static isTypeSupported() {
        return true;
      }
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable?: (e: { data: Blob }) => void;
      onstop?: () => void;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["complete recording"]) });
        queueMicrotask(() => this.onstop?.());
      }
    }
    vi.stubGlobal("MediaRecorder", Recorder);
    const stop = vi.fn();
    const stream = {
      getAudioTracks: () => [{ readyState: "live", stop }],
    } as unknown as MediaStream;
    const save = vi.fn().mockResolvedValue(undefined);
    const finish = archiveLiveAudio(stream, save);
    await vi.advanceTimersByTimeAsync(61000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    await finish();
    expect(save).toHaveBeenCalledTimes(2);
    expect(stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(61000);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
