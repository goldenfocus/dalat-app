import { describe, expect, it, vi } from "vitest";

import {
  isSameOriginLinkActivation,
  primeAudioForLaterPlayback,
} from "./user-gesture-unlock";

describe("site audio gesture unlock", () => {
  it("recognizes same-origin links, including clicks on their children", () => {
    const link = document.createElement("a");
    link.href = "https://dalat.app/es/events";
    const child = document.createElement("span");
    link.appendChild(child);

    expect(isSameOriginLinkActivation(child, "https://dalat.app")).toBe(true);
  });

  it("ignores external links, downloads, and non-link controls", () => {
    const external = document.createElement("a");
    external.href = "https://example.com";
    const download = document.createElement("a");
    download.href = "https://dalat.app/file.zip";
    download.download = "file.zip";

    expect(isSameOriginLinkActivation(external, "https://dalat.app")).toBe(false);
    expect(isSameOriginLinkActivation(download, "https://dalat.app")).toBe(false);
    expect(
      isSameOriginLinkActivation(document.createElement("button"), "https://dalat.app"),
    ).toBe(false);
  });

  it("silently primes an unused audio element and restores its mute state", async () => {
    const audio = {
      src: "",
      muted: false,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      removeAttribute: vi.fn(function (this: { src: string }, name: string) {
        if (name === "src") this.src = "";
      }),
      load: vi.fn(),
    };

    await expect(primeAudioForLaterPlayback(audio)).resolves.toBe(true);
    expect(audio.play).toHaveBeenCalledOnce();
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.removeAttribute).toHaveBeenCalledWith("src");
    expect(audio.load).toHaveBeenCalledOnce();
    expect(audio.muted).toBe(false);
    expect(audio.src).toBe("");
  });

  it("does not disturb an audio element that already has a track", async () => {
    const audio = {
      src: "https://cdn.example.com/song.mp3",
      muted: false,
      play: vi.fn(),
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
    };

    await expect(primeAudioForLaterPlayback(audio)).resolves.toBe(false);
    expect(audio.play).not.toHaveBeenCalled();
  });
});
