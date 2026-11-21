export async function requestVideoPlayback(
  video: HTMLVideoElement,
  soundOn: boolean
): Promise<boolean> {
  video.muted = !soundOn;

  try {
    await video.play();
    return true;
  } catch {
    // Leave the play control visible so a gesture can start the requested sound.
    return false;
  }
}
