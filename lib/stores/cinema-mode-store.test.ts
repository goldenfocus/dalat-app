import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioPlayerStore } from "@/lib/stores/audio-player-store";
import { CHROME_AUTO_HIDE_MS, useCinemaModeStore } from "@/lib/stores/cinema-mode-store";
import type { MomentWithProfile } from "@/lib/types";

const photo = (id: string) => ({ id, content_type: "photo" }) as unknown as MomentWithProfile;
const moments = [photo("a"), photo("b"), photo("c")];

/** Replace the audio store's transport with in-memory fakes (no <audio> element in jsdom). */
function installFakeAudio(isPlaying: boolean) {
  const pause = vi.fn(() => useAudioPlayerStore.setState({ isPlaying: false }));
  const play = vi.fn(async () => useAudioPlayerStore.setState({ isPlaying: true }));
  useAudioPlayerStore.setState({
    tracks: [{ id: "t1", file_url: "x.mp3", title: "Dalat Dusk" } as never],
    currentIndex: 0,
    isPlaying,
    pause,
    play,
  });
  return { pause, play };
}

const cinema = () => useCinemaModeStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  useCinemaModeStore.getState().exit();
});

afterEach(() => {
  useCinemaModeStore.getState().exit();
  vi.useRealTimers();
});

describe("transport sync", () => {
  it("pauses the music with the slideshow and resumes both together", () => {
    const audio = installFakeAudio(true);
    cinema().start(moments, "evt");

    cinema().pause();
    expect(cinema().playbackState).toBe("paused");
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(useAudioPlayerStore.getState().isPlaying).toBe(false);

    cinema().play();
    expect(cinema().playbackState).toBe("playing");
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(useAudioPlayerStore.getState().isPlaying).toBe(true);
  });

  it("does not start music on resume if the viewer had turned it off", () => {
    const audio = installFakeAudio(true);
    cinema().start(moments, "evt");

    cinema().toggleMusic(); // viewer mutes the soundtrack, slides keep going
    expect(cinema().playbackState).toBe("playing");
    expect(useAudioPlayerStore.getState().isPlaying).toBe(false);

    cinema().pause();
    cinema().play();
    expect(audio.play).not.toHaveBeenCalled();
  });

  it("music chip toggles without touching the slides", () => {
    const audio = installFakeAudio(false);
    cinema().start(moments, "evt");

    cinema().toggleMusic();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(cinema().playbackState).toBe("playing");
  });

  it("toggleMusic is a no-op without a track", () => {
    const audio = installFakeAudio(false);
    useAudioPlayerStore.setState({ tracks: [] });
    cinema().start(moments, "evt");
    cinema().toggleMusic();
    expect(audio.play).not.toHaveBeenCalled();
  });
});

describe("restoring music on close", () => {
  it("pauses music that cinema started when it was off before", () => {
    const audio = installFakeAudio(false);
    cinema().captureMusicBaseline();
    useAudioPlayerStore.setState({ isPlaying: true }); // openCinema() starts it
    cinema().start(moments, "evt");

    cinema().exit();
    expect(audio.pause).toHaveBeenCalled();
    expect(useAudioPlayerStore.getState().isPlaying).toBe(false);
  });

  it("leaves music playing when it was playing before cinema opened", () => {
    const audio = installFakeAudio(true);
    cinema().start(moments, "evt");
    cinema().exit();
    expect(audio.pause).not.toHaveBeenCalled();
    expect(useAudioPlayerStore.getState().isPlaying).toBe(true);
  });

  it("resumes music on close if only the transport had paused it", () => {
    const audio = installFakeAudio(true);
    cinema().start(moments, "evt");
    cinema().pause();
    cinema().exit();
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("a second exit is a harmless no-op", () => {
    const audio = installFakeAudio(false);
    cinema().start(moments, "evt");
    useAudioPlayerStore.setState({ isPlaying: true });
    cinema().exit();
    cinema().exit();
    expect(audio.pause).toHaveBeenCalledTimes(1);
  });
});

describe("chrome reveal and auto-hide", () => {
  it("auto-hides after the delay while playing", () => {
    installFakeAudio(false);
    cinema().start(moments, "evt");
    expect(cinema().showControls).toBe(true);

    vi.advanceTimersByTime(CHROME_AUTO_HIDE_MS - 1);
    expect(cinema().showControls).toBe(true);
    vi.advanceTimersByTime(1);
    expect(cinema().showControls).toBe(false);
  });

  it("interaction restarts the countdown", () => {
    installFakeAudio(false);
    cinema().start(moments, "evt");
    vi.advanceTimersByTime(2000);
    cinema().revealChrome();
    vi.advanceTimersByTime(2000);
    expect(cinema().showControls).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(cinema().showControls).toBe(false);
  });

  it("stays visible while paused, however long", () => {
    installFakeAudio(false);
    cinema().start(moments, "evt");
    vi.advanceTimersByTime(CHROME_AUTO_HIDE_MS + 10);
    expect(cinema().showControls).toBe(false);

    cinema().pause();
    expect(cinema().showControls).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(cinema().showControls).toBe(true);
  });

  it("starts the countdown again on resume", () => {
    installFakeAudio(false);
    cinema().start(moments, "evt");
    cinema().pause();
    cinema().play();
    expect(cinema().showControls).toBe(true);
    vi.advanceTimersByTime(CHROME_AUTO_HIDE_MS);
    expect(cinema().showControls).toBe(false);
  });
});
