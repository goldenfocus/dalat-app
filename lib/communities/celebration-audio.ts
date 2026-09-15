// Prime the shared sound during the original tap, before network requests consume
// mobile browsers' user activation. Reuse that same element after success.
let preparedAudio: HTMLAudioElement | null = null;
export function prepareCelebrationAudio() {
  try {
    if (localStorage.getItem('dalat-celebration-muted') === 'true') return;
    const audio = preparedAudio ?? new Audio('/sounds/celebration.mp3');
    preparedAudio = audio;
    audio.volume = 0;
    void audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {});
  } catch { /* Visual confirmation still works without audio. */ }
}
export function takeCelebrationAudio() {
  const audio = preparedAudio ?? new Audio('/sounds/celebration.mp3');
  preparedAudio = null;
  return audio;
}
