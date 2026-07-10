/**
 * Format duration in seconds to MM:SS or HH:MM:SS.
 * Kept separate from audio-metadata so UI code never pulls music-metadata.
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return "";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
