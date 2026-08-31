export async function requestVideoPlayback(
  video: HTMLVideoElement,
  soundOn: boolean
): Promise<boolean> {
  video.muted = !soundOn;

  try {
    await video.play();
    return true;
  } catch {
    // Browsers commonly reject delayed or unmuted playback. Retry muted so
    // cinema can continue even when audio autoplay is not allowed.
    video.muted = true;
    try {
      await video.play();
      return true;
    } catch {
      return false;
    }
  }
}
