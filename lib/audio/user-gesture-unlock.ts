const SILENT_WAV =
  "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

type PrimeableAudio = Pick<
  HTMLAudioElement,
  "load" | "muted" | "pause" | "play" | "removeAttribute" | "src"
>;

/**
 * Only same-origin links should unlock the persistent site audio session.
 * This covers pointer, keyboard, and assistive-technology link activation.
 */
export function isSameOriginLinkActivation(
  target: EventTarget | null,
  origin: string,
): boolean {
  if (!(target instanceof Element)) return false;

  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (!link || link.hasAttribute("download")) return false;

  try {
    return new URL(link.href, origin).origin === origin;
  } catch {
    return false;
  }
}

/**
 * Play a tiny muted clip during a real user gesture. Browsers then recognize
 * the existing HTMLAudioElement as user-activated when a Moments playlist is
 * loaded later in the same client-side browsing session.
 */
export async function primeAudioForLaterPlayback(
  audio: PrimeableAudio,
): Promise<boolean> {
  if (audio.src) return false;

  const wasMuted = audio.muted;
  audio.muted = true;
  audio.src = SILENT_WAV;

  try {
    await audio.play();

    // A playlist may replace the source while the silent clip is starting.
    // Never pause or clear that real track.
    if (audio.src !== SILENT_WAV) return false;

    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    return true;
  } catch {
    return false;
  } finally {
    audio.muted = wasMuted;
  }
}
