const SILENT_WAV =
  "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

type PrimeableAudio = Pick<
  HTMLAudioElement,
  "load" | "pause" | "play" | "removeAttribute" | "src"
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
 * Use a trusted gesture to prime the element with a tiny recording of silence.
 * The element stays unmuted so it can play the real soundtrack after navigation.
 */
export async function primeAudioForLaterPlayback(
  audio: PrimeableAudio,
): Promise<boolean> {
  if (audio.src) return false;

  audio.src = SILENT_WAV;

  try {
    await audio.play();

    return audio.src === SILENT_WAV;
  } catch {
    return false;
  } finally {
    // A playlist may replace the source while the silent clip is starting.
    if (audio.src === SILENT_WAV) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  }
}
