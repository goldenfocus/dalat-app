// Prefer WebM where supported. Safari falls back to its native MP4 recorder.
export function recordingMime() {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
}
// Live audio is archived as complete one-minute files; it never interrupts WebRTC.
// Complete files remain independently playable after a disconnect or retry.
export function archiveLiveAudio(
  stream: MediaStream,
  save: (blob: Blob, mime: string) => Promise<void>,
) {
  const mime = recordingMime();
  if (!mime) throw new Error("unsupported");
  let active = true;
  let recorder: MediaRecorder;
  let complete: Promise<void> = Promise.resolve();
  let pending = Promise.resolve();
  function begin() {
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      audioBitsPerSecond: 64000,
    });
    const pieces: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) pieces.push(e.data);
    };
    complete = new Promise<void>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(pieces, { type: recorder.mimeType });
        if (blob.size) {
          pending = pending.catch(() => {}).then(() => save(blob, blob.type));
          // Keep failures observable at finish without an unhandled rejection
          // while the interview continues. The caller retains failed uploads.
          void pending.catch(() => {});
        }
        resolve();
        if (
          active &&
          stream.getAudioTracks().some((track) => track.readyState === "live")
        )
          begin();
      };
    });
    recorder.start();
  }
  begin();
  const interval = setInterval(() => {
    if (recorder.state === "recording") recorder.stop();
  }, 60000);
  return async () => {
    active = false;
    clearInterval(interval);
    if (recorder.state === "recording") recorder.stop();
    await complete;
    await pending;
  };
}
