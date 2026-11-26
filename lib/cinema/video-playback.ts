import { isMediaAutoplayBlocked } from "@/lib/audio/user-gesture-unlock";

export async function requestVideoPlayback(
  video: HTMLVideoElement,
  soundOn: boolean,
  allowMutedFallback = false,
): Promise<boolean> {
  video.muted = !soundOn;

  try {
    await video.play();
    return true;
  } catch (error) {
    // Only retry silently when the browser specifically rejects audible autoplay.
    if (!soundOn || !allowMutedFallback || !isMediaAutoplayBlocked(error)) {
      return false;
    }

    video.muted = true;
    try {
      await video.play();
      return true;
    } catch {
      return false;
    }
  }
}
